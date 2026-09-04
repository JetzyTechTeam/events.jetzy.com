import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { PremiumPageView } from "@/models/events/premium-page-view"
import { ensureDbConnected } from "@/configs/database"
import { clientKey, isRateLimited } from "@/lib/rate-limit"
import { Types } from "mongoose"
import zod from "zod"

const schema = zod.object({
	anonId: zod.string().min(1).max(64),
	sessionId: zod.string().max(64).optional(),
	page: zod.enum(["premium", "subscribe", "modal"]),
	stage: zod.enum(["landed", "checkout_started"]),
	code: zod.string().max(64).optional(),
	eventId: zod.string().max(24).optional(),
})

// Generous: this fires on page loads, and a shared wifi is a normal case. Still bounded so the
// endpoint can't be used to write unlimited rows.
const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Records where a visitor got to on `/premium` or `/subscribe`, including one opened from a
 * host's referral share link. **Anonymous by design** — no session, no cookie, no email
 * required.
 *
 * `membership_purchases` is written only once Stripe confirms a sale, so everyone who opened the
 * page and didn't buy left no trace at all. This is what makes them countable.
 *
 * Stages are recorded with `$min`, so the EARLIEST time wins and a return visit can't rewrite
 * when this person first landed or first started checkout. `purchasedAt` is never written here —
 * only the Stripe webhook can confirm a sale, see `webhooks/stripe.ts`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, null, "Invalid tracking payload", false, ResCode.BAD_REQUEST)
		}

		if (isRateLimited(`premium-view:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
			// Silently accepted: a dropped analytics ping must never surface to the visitor.
			return sendResponse(res, null, "Recorded", true, ResCode.OK)
		}

		await ensureDbConnected()

		const { anonId, sessionId, page, stage, code, eventId } = validation.data
		const normalizedCode = (code || "").trim()
		const now = new Date()

		const update: any = {
			$setOnInsert: { page, code: normalizedCode, anonId },
		}
		if (sessionId) update.$set = { ...(update.$set || {}), sessionId }
		// Only a referral share link carries an event id, and only alongside its code — a plain
		// visit that later types the same string as a code is a different row (no eventId), so
		// it never gets attributed to a campaign it didn't come from.
		if (eventId && Types.ObjectId.isValid(eventId) && normalizedCode) {
			update.$set = { ...(update.$set || {}), eventId: new Types.ObjectId(eventId) }
		}

		if (stage === "landed") {
			update.$inc = { views: 1 }
			update.$min = { landedAt: now }
		} else {
			update.$min = { checkoutStartedAt: now }
		}

		await PremiumPageView.updateOne({ page, code: normalizedCode, anonId }, update, { upsert: true })

		return sendResponse(res, null, "Recorded", true, ResCode.OK)
	} catch (error: any) {
		console.error("[analytics/premium-view] Error:", error)
		// Never fail loudly: this is instrumentation on a page the visitor came to look at.
		return sendResponse(res, null, "Recorded", true, ResCode.OK)
	}
}
