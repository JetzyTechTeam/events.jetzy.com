import type { NextApiRequest, NextApiResponse } from "next"
import crypto from "crypto"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { Users } from "@Jetzy/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import { Roles } from "@Jetzy/types"
import { sendVerificationEmail, sendWelcomeEmail } from "@Jetzy/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { name, email, acceptedTerms, cb } = req.body || {}
		const cleanCb = typeof cb === "string" && cb.trim() ? cb.trim() : undefined

		const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : ""
		const cleanName = typeof name === "string" ? name.trim() : ""

		if (!cleanEmail || !cleanName) {
			return sendResponse(res, null, "Name and email are required.", false, ResCode.BAD_REQUEST)
		}

		if (!acceptedTerms) {
			return sendResponse(res, null, "You must accept the Terms and Conditions.", false, ResCode.BAD_REQUEST)
		}

		const existingInUsers = await Users.findOne({ email: cleanEmail })
		const existingInEventUsers = await EventUsers.findOne({ email: cleanEmail })
		const existing = existingInEventUsers || existingInUsers

		if (existing) {
			return res.status(ResCode.CONFLICT).json({
				message: "Email already registered.",
				status: false,
				code: "EMAIL_EXISTS",
				data: null,
			})
		}

		const token = crypto.randomBytes(32).toString("hex")

		await EventUsers.create({
			firstName: cleanName,
			lastName: "",
			email: cleanEmail,
			role: Roles.USER,
			acceptedTerms: true,
			acceptedTermsAt: new Date(),
			emailVerified: false,
			verifyToken: token,
			signupSource: "signup",
		})

		try {
			await sendVerificationEmail({ email: cleanEmail, firstName: cleanName, token, cb: cleanCb })
		} catch (err) {
			console.error("sendVerificationEmail failed:", err)
		}

		try {
			await sendWelcomeEmail({ email: cleanEmail, firstName: cleanName, lastName: "" })
		} catch (err) {
			console.error("sendWelcomeEmail failed:", err)
		}

		return sendResponse(res, { email: cleanEmail }, "Verification email sent.", true, ResCode.OK)
	} catch (error: any) {
		console.error("start-signup error:", error?.message)
		return sendResponse(res, null, error?.message || "Failed to start signup.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
