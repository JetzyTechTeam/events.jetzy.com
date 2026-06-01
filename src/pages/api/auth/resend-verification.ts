import type { NextApiRequest, NextApiResponse } from "next"
import crypto from "crypto"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { EventUsers } from "@/models/eventUsersModal"
import { sendVerificationEmail } from "@Jetzy/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { email } = req.body || {}
		const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : ""

		if (!cleanEmail) {
			return sendResponse(res, null, "Email is required.", false, ResCode.BAD_REQUEST)
		}

		const user = await EventUsers.findOne({ email: cleanEmail, emailVerified: false })

		if (user) {
			const token = crypto.randomBytes(32).toString("hex")
			user.verifyToken = token
			await user.save()

			try {
				await sendVerificationEmail({ email: cleanEmail, firstName: user.firstName, token })
			} catch (err) {
				console.error("resend-verification send failed:", err)
			}
		}

		// Always 200 to avoid email enumeration.
		return sendResponse(res, null, "If an unverified account exists, a new link was sent.", true, ResCode.OK)
	} catch (error: any) {
		console.error("resend-verification error:", error?.message)
		return sendResponse(res, null, error?.message || "Failed to resend verification.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
