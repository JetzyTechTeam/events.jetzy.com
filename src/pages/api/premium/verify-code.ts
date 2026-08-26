import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { consumeAlbumCode, consumeFailureMessage } from "@/lib/album-verification"
import { generateMagicToken } from "@/lib/magicLink"
import { clientKey, isRateLimited } from "@/lib/rate-limit"
import zod from "zod"

const schema = zod.object({
	email: zod.string().email(),
	/** Present only when the code was issued against a shared referral link. */
	event: zod.string().min(1).optional(),
	/** The 6-digit code from the email. */
	otp: zod.string().min(4).max(10),
})

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Step two: spend the code and hand back a magic token the browser can sign in with.
 *
 * The token is minted **server-side, only after a code is consumed** — the same contract
 * `api/auth/verify-login-otp.ts` operates under. The client never supplies it, and a wrong code
 * burns one of five attempts before the code dies.
 *
 * No account is created here either. `signIn("credentials", { magicToken })` does that: NextAuth's
 * `authorize` JIT-creates the record when the token names an email it has never seen, which is the
 * same path the mobile magic-link login has always used.
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

		if (isRateLimited(`premium-verify:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
			return sendResponse(res, null, "Too many attempts. Please slow down.", false, ResCode.TOO_MANY_REQUESTS)
		}

		const email = validation.data.email.trim().toLowerCase()
		const result = await consumeAlbumCode(validation.data.event || null, email, validation.data.otp.trim(), "premium")

		if (!result.ok) {
			return sendResponse(res, { verified: false, reason: result.reason }, consumeFailureMessage(result.reason), false, ResCode.BAD_REQUEST)
		}

		return sendResponse(res, { verified: true, magicToken: generateMagicToken({ email }) }, "Email confirmed.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[premium/verify-code] Error:", error?.message || error)
		return sendResponse(res, null, "We couldn't confirm that code. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
