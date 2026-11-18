import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { consumeAlbumCode, consumeFailureMessage } from "@/lib/album-verification"
import { generateMagicToken } from "@/lib/magicLink"
import { clientKey, isRateLimited } from "@/lib/rate-limit"
import { verifyBackendLoginCode, verifyFailureMessage } from "@/lib/backend-login-code"
import zod from "zod"

const schema = zod.object({
	email: zod.string().email(),
	/** The 6-digit code from the email. */
	otp: zod.string().min(4).max(10),
	/** Which code `send-code` sent: "jetzy" = the backend login code; anything else = ours. */
	via: zod.enum(["jetzy", "portal"]).optional(),
	// The name typed in the checkout form. Used by the backend only when this call CREATES the
	// account; an existing account keeps its own name.
	firstName: zod.string().trim().max(100).optional(),
	lastName: zod.string().trim().max(100).optional(),
})

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Ticket checkout, step two: spend the code and hand back a magic token the browser signs in with.
 *
 * With the backend's login code (`via: "jetzy"`) a correct code CREATES the Jetzy account when the
 * address has none — the same `AuthLib.createUser()` as normal signup — and returns a real
 * accessToken, which rides inside the signed magic token into the session. That is the "booking a
 * ticket creates your Jetzy account and signs you in" rule.
 *
 * On the outage fallback (our own code) NextAuth's `authorize` JIT-creates the local record from the
 * token instead, exactly like `api/premium/verify-code.ts`.
 *
 * The token is minted server-side only after a code is consumed; the client never supplies it.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, null, "Enter the 6-digit code from your email.", false, ResCode.BAD_REQUEST)
		}

		if (isRateLimited(`ticket-verify:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
			return sendResponse(res, null, "Too many attempts. Please slow down.", false, ResCode.TOO_MANY_REQUESTS)
		}

		const email = validation.data.email.trim().toLowerCase()
		const firstName = validation.data.firstName || undefined
		const lastName = validation.data.lastName || undefined

		if (validation.data.via === "jetzy") {
			const verified = await verifyBackendLoginCode(email, validation.data.otp, { firstName, lastName, source: "web_ticket" })
			if (!verified.ok) {
				return sendResponse(res, { verified: false }, verifyFailureMessage(verified.status, verified.message), false, ResCode.BAD_REQUEST)
			}
			const magicToken = generateMagicToken({
				email,
				accessToken: verified.accessToken,
				// The account's own name wins for an existing account; the typed one names a new one.
				firstName: verified.firstName || firstName,
				lastName: verified.lastName || lastName,
			})
			return sendResponse(res, { verified: true, magicToken, isNewUser: verified.isNewUser }, "Email confirmed.", true, ResCode.OK)
		}

		const result = await consumeAlbumCode(null, email, validation.data.otp.trim(), "ticket")
		if (!result.ok) {
			return sendResponse(res, { verified: false, reason: result.reason }, consumeFailureMessage(result.reason), false, ResCode.BAD_REQUEST)
		}

		return sendResponse(res, { verified: true, magicToken: generateMagicToken({ email, firstName, lastName }) }, "Email confirmed.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[checkout/verify-code] Error:", error?.message || error)
		return sendResponse(res, null, "We couldn't confirm that code. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
