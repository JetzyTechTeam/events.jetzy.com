// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { grantSignupTrial } from "@/lib/signup-trial"
import { isSignupTrialCode } from "@/lib/invite-trial"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { Users } from "@Jetzy/models/userModal"
import { Roles } from "@Jetzy/types"
import type { NextApiRequest, NextApiResponse } from "next"
import bcrypt from "bcrypt"
import { EventUsers } from "@/models/eventUsersModal"

type Data = {
	firstName: string
	lastName: string
	email: string
	password: string
	shouldBeAJetzyMember: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
	try {
		const { firstName, lastName, email, password, shouldBeAJetzyMember, acceptedTerms, location, latitude, longitude, placeId, refCode, signupSource, signupSessionId } = req?.body

		const userType = Roles.USER

		const hashPassword = await bcrypt.hash(password, 10)

		let user = null;
		// For QR Scanner flow, we want users to be in EventUsers for better isolation
		// Check both collections to ensure unique emails
		const existingInUsers = await Users.findOne({ email });
		const existingInEventUsers = await EventUsers.findOne({ email });
		const existingUser = existingInEventUsers || existingInUsers;

		if (existingUser) {
			return sendResponse(res, null, "You are already a member! Please log in to your account.", false, ResCode.CONFLICT);
		}

		// Create New user in EventUsers
		user = await EventUsers.create({
			firstName,
			lastName,
			email,
			password: hashPassword,
			role: userType,
			acceptedTerms: acceptedTerms || false,
			acceptedTermsAt: acceptedTerms ? new Date() : null,
			// Location data for future event proximity matching
			...(location && { location }),
			...(latitude !== undefined && { latitude }),
			...(longitude !== undefined && { longitude }),
			...(placeId && { placeId }),
			...(refCode && { refCode }),
			// Attribution: which page the signup came from + analytics session
			...(signupSource && { signupSource }),
			...(signupSessionId && { signupSessionId }),
		})

		if (!user || user === null) return sendResponse(res, null, "Failed to create user account.", false, ResCode.INTERNAL_SERVER_ERROR)

		// Referral attribution: mirror the mobile/webchat signup by registering the
		// user on the main Jetzy backend with the invite code, so the referrer is
		// credited. Best-effort — a backend failure must not break local signup.
		// Only runs when a code is present (no-code signups keep the deferred
		// JIT-sync path that happens on first login).
		// An invite code granting free Jetzy Premium is NOT a backend referral code — it lives in
		// `TRIAL_CODES`, credits nobody, and would just be rejected there. Granted at creation on
		// this path because the generated password only reaches the person by email: an address
		// they don't control gets them an account they can't sign into.
		if (refCode && isSignupTrialCode(refCode)) {
			await grantSignupTrial({
				email,
				firstName,
				userId: String((user as any)?._id),
				code: refCode,
			})
		} else if (refCode) {
			try {
				const externalApiUrl = process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com"
				const controller = new AbortController()
				const timeoutId = setTimeout(() => controller.abort(), 8000)

				const backendRes = await fetch(`${externalApiUrl}/api/v1/accounts/create`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					// Same shape mobile/webchat send to /v1/accounts/create
					body: JSON.stringify({
						email,
						password, // plaintext — backend hashes its own copy
						role: userType,
						firstName: firstName ?? null,
						lastName: lastName ?? null,
						bio: null,
						image: null,
						refCode,
					}),
					signal: controller.signal,
				})
				clearTimeout(timeoutId)

				if (backendRes.ok || backendRes.status === 409) {
					console.log(`[create] Backend referral registration ${backendRes.status === 409 ? "skipped (already exists)" : "ok"} for ${email}, refCode=${refCode}`)
				} else {
					const errText = await backendRes.text().catch(() => "")
					console.warn(`[create] Backend referral registration failed (${backendRes.status}) for ${email}: ${errText.substring(0, 120)}`)
				}
			} catch (err: any) {
				console.warn(`[create] Backend referral registration error for ${email}:`, err?.name === "AbortError" ? "timeout" : err?.message || err)
			}
		}

		return sendResponse(res, user, "User account created successfully.", true, ResCode.CREATED)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
