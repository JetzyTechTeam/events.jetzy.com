import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { ensureDbConnected } from "@/configs/database"
import { escapeRegExp } from "@/utils/text"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

/**
 * GET /api/users/search?q=<query>
 * Requires auth. Searches EventUsers by name or email.
 * Returns: [{ _id, firstName, lastName, email, image }]
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)

	const session = await getServerSession(req, res, authOptions)
	if (!session) return sendResponse(res, null, "Unauthorized.", false, ResCode.UNAUTHORIZED)

	try {
		await ensureDbConnected()

		const q = (req.query.q as string || "").trim()
		if (!q || q.length < 2) return sendResponse(res, [], "Query too short.", true, ResCode.OK)

		const safeQ = escapeRegExp(q)
		const regex = new RegExp(safeQ, "i")

		const users = await EventUsers.find(
			{
				$or: [
					{ firstName: regex },
					{ lastName: regex },
					{ email: regex },
					// full name search
					{
						$expr: {
							$regexMatch: {
								input: { $concat: ["$firstName", " ", "$lastName"] },
								regex: safeQ,
								options: "i",
							},
						},
					},
				],
				// exclude the current user
				email: { $ne: session.user?.email },
			},
			{ _id: 1, firstName: 1, lastName: 1, email: 1, image: 1 },
		)
			.limit(20)
			.lean()

		return sendResponse(res, users, "Users found.", true, ResCode.OK)
	} catch (error: any) {
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
