import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { ensureDbConnected } from "@/configs/database"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { isSupportCategory } from "@/lib/support"
import { SupportRequest } from "@/models/support-request"
import { escapeRegExp } from "@/utils/text"

/** ADMIN ONLY — names, emails and messages from every /support submission. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) return sendResponse(res, null, "Not authenticated", false, ResCode.UNAUTHORIZED)

		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		if (!isAdmin) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)

		const category = req.query.category as string
		const search = (req.query.search as string)?.trim()

		const filter: any = {}
		if (isSupportCategory(category)) filter.category = category
		if (search) {
			const rx = { $regex: escapeRegExp(search), $options: "i" }
			filter.$or = [{ name: rx }, { email: rx }, { message: rx }, { eventName: rx }]
		}

		const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1)
		const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20", 10) || 20))

		const [items, total] = await Promise.all([
			SupportRequest.find(filter)
				.sort({ createdAt: -1 })
				.skip((page - 1) * limit)
				.limit(limit)
				.lean(),
			SupportRequest.countDocuments(filter),
		])

		return sendResponse(
			res,
			{ items, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } },
			"OK",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[support/list] Failed:", error)
		return sendResponse(res, null, `Failed to load support requests: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
