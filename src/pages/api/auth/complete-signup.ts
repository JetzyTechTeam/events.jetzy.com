import type { NextApiRequest, NextApiResponse } from "next"
import bcrypt from "bcrypt"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { EventUsers } from "@/models/eventUsersModal"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { token, password } = req.body || {}

		if (!token || typeof token !== "string") {
			return sendResponse(res, null, "Missing token.", false, ResCode.BAD_REQUEST)
		}
		if (!password || typeof password !== "string" || password.length < 8) {
			return sendResponse(res, null, "Password must be at least 8 characters.", false, ResCode.BAD_REQUEST)
		}

		const user = await EventUsers.findOne({ verifyToken: token })

		if (!user) {
			return sendResponse(res, null, "Invalid link.", false, ResCode.NOT_FOUND)
		}

		const hashed = await bcrypt.hash(password, 10)

		user.password = hashed
		user.emailVerified = true
		user.verifyToken = undefined
		await user.save()

		return sendResponse(res, { email: user.email }, "Account ready.", true, ResCode.OK)
	} catch (error: any) {
		console.error("complete-signup error:", error?.message)
		return sendResponse(res, null, error?.message || "Failed to complete signup.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
