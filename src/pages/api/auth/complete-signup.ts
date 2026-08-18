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

		// Credit the referrer.
		//
		// The invite code was captured on /signup, but this is the FIRST moment it can be
		// forwarded: the Jetzy backend's /v1/accounts/create needs a password and, in a
		// verification-link signup, there isn't one until now. /jetzyqrsignup makes the same
		// call at account creation because it generates the password itself.
		//
		// Best-effort in every direction — a backend outage, a timeout, or an account that
		// already exists there must never stop someone finishing their own signup. A no-code
		// signup keeps the existing deferred JIT sync on first login.
		if (user.refCode) {
			try {
				const externalApiUrl = process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com"
				const controller = new AbortController()
				const timeoutId = setTimeout(() => controller.abort(), 8000)

				const backendRes = await fetch(`${externalApiUrl}/api/v1/accounts/create`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					// The same shape mobile, webchat and /jetzyqrsignup send. The password is the
					// plaintext the user just chose — the backend hashes its own copy.
					body: JSON.stringify({
						email: user.email,
						password,
						role: user.role || "user",
						firstName: user.firstName ?? null,
						lastName: user.lastName ?? null,
						bio: null,
						image: null,
						refCode: user.refCode,
					}),
					signal: controller.signal,
				})
				clearTimeout(timeoutId)

				if (backendRes.ok || backendRes.status === 409) {
					console.log(
						`[complete-signup] Backend referral registration ${backendRes.status === 409 ? "skipped (already exists)" : "ok"} for ${user.email}, refCode=${user.refCode}`,
					)
				} else {
					const errText = await backendRes.text().catch(() => "")
					console.warn(
						`[complete-signup] Backend referral registration failed (${backendRes.status}) for ${user.email}: ${errText.substring(0, 120)}`,
					)
				}
			} catch (err: any) {
				console.warn(
					`[complete-signup] Backend referral registration error for ${user.email}:`,
					err?.name === "AbortError" ? "timeout" : err?.message || err,
				)
			}
		}

		return sendResponse(res, { email: user.email }, "Account ready.", true, ResCode.OK)
	} catch (error: any) {
		console.error("complete-signup error:", error?.message)
		return sendResponse(res, null, error?.message || "Failed to complete signup.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
