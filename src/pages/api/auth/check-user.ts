import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { Users } from "@/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import type { NextApiRequest, NextApiResponse } from "next"

type Data = {
	exists: boolean
	hasPassword: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data | { message: string }>) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const { email, isJetzyMember } = req.body

		if (!email) {
			return sendResponse(res, null, "Email is required", false, ResCode.BAD_REQUEST)
		}

		// Normalize email to lowercase
		const normalizedEmail = email.toLowerCase().trim()

		// Determine which user model to use
		const userModel = isJetzyMember === true || isJetzyMember === "true" ? EventUsers : Users

		// Find user by email
		const user = await userModel.findOne({ email: normalizedEmail }).select("+password")

		if (!user) {
			return sendResponse(res, { exists: false, hasPassword: false }, "User does not exist", true, ResCode.OK)
		}

		// Check if user has a password
		const hasPassword = !!(user.password && user.password.trim() !== "")

		return sendResponse(res, { exists: true, hasPassword }, "User exists", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error checking user:", error)
		return sendResponse(res, null, error.message || "Failed to check user", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
