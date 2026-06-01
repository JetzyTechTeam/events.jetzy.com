import type { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { EventUsers } from "@/models/eventUsersModal"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const token = typeof req.query.token === "string" ? req.query.token : ""
		if (!token) {
			return sendResponse(res, null, "Missing token.", false, ResCode.BAD_REQUEST)
		}

		const user = await EventUsers.findOne({ verifyToken: token })

		if (!user) {
			return sendResponse(res, null, "Invalid link.", false, ResCode.NOT_FOUND)
		}

		return sendResponse(
			res,
			{ email: user.email, firstName: user.firstName, alreadyVerified: !!user.password },
			"Token valid.",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("verify-token error:", error?.message)
		return sendResponse(res, null, error?.message || "Failed to verify token.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
