import type { NextApiRequest, NextApiResponse } from "next"
import crypto from "crypto"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { Users } from "@Jetzy/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import { Roles } from "@Jetzy/types"
import { sendVerificationEmail, sendWelcomeEmail } from "@Jetzy/lib/send-grid"
import { signupTrialOffer } from "@/lib/invite-trial"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { name, email, acceptedTerms, cb, refCode } = req.body || {}
		// Optional. Stored now; the Jetzy backend is told once the account has a password,
		// because /v1/accounts/create needs one — see complete-signup.ts.
		const cleanRefCode = typeof refCode === "string" && refCode.trim() ? refCode.trim() : undefined
		const cleanCb = typeof cb === "string" && cb.trim() ? cb.trim() : undefined
		// A membership invite code, as opposed to a referral code that credits somebody. Resolved
		// here only to describe it — the grant itself happens at `complete-signup`.
		const trialOffer = signupTrialOffer(cleanRefCode)

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
			...(cleanRefCode && { refCode: cleanRefCode }),
		})

		try {
			// The code is only WORTH anything once the address is proven, so the email names the
			// months as waiting rather than granted — `complete-signup` is where they are created.
			await sendVerificationEmail({
				email: cleanEmail,
				firstName: cleanName,
				token,
				cb: cleanCb,
				...(trialOffer ? { trialMonths: trialOffer.months } : {}),
			})
		} catch (err) {
			console.error("sendVerificationEmail failed:", err)
		}

		try {
			await sendWelcomeEmail({ email: cleanEmail, firstName: cleanName, lastName: "" })
		} catch (err) {
			console.error("sendWelcomeEmail failed:", err)
		}

		return sendResponse(
			res,
			// The months are echoed back so the next screen can say what is waiting behind the
			// link. Nothing is granted yet — `complete-signup` does that, once the address is proven.
			{ email: cleanEmail, ...(trialOffer ? { trialMonths: trialOffer.months } : {}) },
			"Verification email sent.",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("start-signup error:", error?.message)
		return sendResponse(res, null, error?.message || "Failed to start signup.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
