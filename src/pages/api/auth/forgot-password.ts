import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { Users } from "@Jetzy/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import type { NextApiRequest, NextApiResponse } from "next"
import bcrypt from "bcrypt"

type Data = {
	email: string
	password: string
	confirmPassword: string
	isJetzyMember?: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[forgot-password] Database not connected, attempting to connect...")
			try {
				await Promise.race([
					dbconn.asPromise(),
					new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 30000)),
				])
				console.log("[forgot-password] Database connected successfully")
			} catch (connError: any) {
				console.error("[forgot-password] Database connection failed:", connError.message)
				return sendResponse(res, null, "Database connection failed. Please try again later.", false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}

		const { email, password, confirmPassword, isJetzyMember } = req.body

		console.log("[forgot-password] Request received:", { email, isJetzyMember, hasPassword: !!password, hasConfirmPassword: !!confirmPassword })

		// Validate required fields
		if (!email || !password || !confirmPassword) {
			return sendResponse(res, null, "Email, password, and confirm password are required.", false, ResCode.BAD_REQUEST)
		}

		// Validate passwords match
		if (password !== confirmPassword) {
			return sendResponse(res, null, "Passwords do not match.", false, ResCode.BAD_REQUEST)
		}

		// Normalize email to lowercase
		const normalizedEmail = email.toLowerCase().trim()

		// Determine which user model to use
		const userModel = isJetzyMember === true || isJetzyMember === "true" ? EventUsers : Users

		// Find user by email
		const user = await userModel.findOne({ email: normalizedEmail }).select("+password")

		if (!user) {
			console.log("[forgot-password] User not found:", normalizedEmail)
			return sendResponse(res, null, "User not found with this email address.", false, ResCode.NOT_FOUND)
		}

		console.log("[forgot-password] User found, resetting password for:", normalizedEmail)

		// Hash the new password
		const hashedPassword = await bcrypt.hash(password, 10)

		// Update user password
		user.password = hashedPassword
		await user.save({ validateModifiedOnly: true })

		console.log("[forgot-password] Password reset successful for:", normalizedEmail)

		return sendResponse(res, { email: user.email }, "Password reset successfully. You can now login with your new password.", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error resetting password:", error)
		return sendResponse(res, null, error.message || "Failed to reset password.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
