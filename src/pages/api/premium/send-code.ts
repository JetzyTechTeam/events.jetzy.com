import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { issueAlbumCode } from "@/lib/album-verification"
import { resolveReferralTrial } from "@/lib/referral-trial"
import { sendPremiumVerificationCode } from "@/lib/send-grid"
import { clientKey, isRateLimited } from "@/lib/rate-limit"
import zod from "zod"

const schema = zod.object({
	email: zod.string().email(),
	/**
	 * The event the shared referral code belongs to.
	 *
	 * Optional: a shared referral link has one, and `/premium`, `/subscribe` and the paywall
	 * modal have none. Its presence is what selects the referral branch below.
	 */
	event: zod.string().min(1).optional(),
	/** The referral code from the shared link. Only meaningful alongside `event`. */
	code: zod.string().min(1).optional(),
})

// Same shape as the album gate: generous for a household behind one IP, tight enough that this
// isn't a free mail cannon.
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Step one of buying Premium from a shared referral link without an account: email a 6-digit code
 * to the address the visitor typed.
 *
 * Nothing is created here — no account, no session, no Stripe customer. Those happen after the
 * code comes back, so an address nobody controls leaves no trace.
 *
 * Two shapes:
 *
 * - **With `event` + `code`** — a host's shared referral link. The offer is resolved BEFORE a single
 *   email goes out, with the same resolver the charge uses, so the code sitting in the inbox can't
 *   outlive the offer it was sent for.
 * - **Without either** — buying Premium at the normal price from `/premium`, `/subscribe` or the
 *   paywall modal. There is no link to validate, so the only gate is the rate limit: this is an
 *   ordinary "email me a sign-in code" flow, and the code alone gets nobody anything except a
 *   session on their own address.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, null, "Please enter a valid email address.", false, ResCode.BAD_REQUEST)
		}

		if (isRateLimited(`premium-code:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
			return sendResponse(res, null, "Too many requests. Please slow down.", false, ResCode.TOO_MANY_REQUESTS)
		}

		const { email: rawEmail, event, code } = validation.data
		const email = rawEmail.trim().toLowerCase()

		let months: number | undefined
		if (event && code) {
			// The offer has to be real before we email anybody about it — and the same resolver the
			// charge uses, so the code in the inbox can't outlive the offer it was sent for.
			const offer = await resolveReferralTrial(event, code)
			if (!offer.ok) {
				return sendResponse(res, null, offer.message, false, ResCode.BAD_REQUEST)
			}
			months = offer.months
		}

		const issued = await issueAlbumCode(event || null, email, "premium")
		if (!issued) {
			return sendResponse(res, null, "A code was just sent. Please wait a moment before asking for another.", false, ResCode.TOO_MANY_REQUESTS)
		}

		// `months` is undefined off the referral branch, and the email says "your Jetzy Premium
		// membership" instead of naming free months that were never promised.
		await sendPremiumVerificationCode({ email, code: issued.code, months })

		// Never the code itself, and never whether the address already has an account.
		return sendResponse(res, { sent: true }, "We've emailed you a code.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[premium/send-code] Error:", error?.message || error)
		return sendResponse(res, null, "We couldn't send that code. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
