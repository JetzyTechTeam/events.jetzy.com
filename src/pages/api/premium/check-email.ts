import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Types } from "mongoose"
import { isPremiumEmail } from "@/lib/premium-eligibility"
import { eventHasAnyPremiumTicket } from "@/lib/premium-bundle"
import { getPremiumTicketAllowance } from "@/lib/premium-ticket-limit"

/**
 * "Does this email already have Jetzy Premium?"
 *
 * Used when a ticket SELLS a membership (`IEventTicket.includesPremium`): an existing member
 * pays for the ticket alone, everyone else is also charged the monthly subscription. So this
 * decides whether a recurring charge appears in the checkout preview — a price disclosure,
 * not a nicety.
 *
 * Deliberately unauthenticated — the whole point is that a guest who already pays for Jetzy
 * Premium can be recognised by the address they type into checkout, before they have logged
 * in. `src/lib/premium-eligibility.ts` explains why the email, not the session, is authority.
 *
 * PREVIEW ONLY. `api/checkout` resolves membership again server-side and stays authoritative.
 *
 * Two things keep the enumeration surface narrow, since anyone can call this:
 *   1. It answers `false` without touching the user collections unless a ticket on the event
 *      actually sells a membership. Most events don't, so most probes learn nothing.
 *   2. The response carries no PII — just two booleans.
 * Plus the rate limit below.
 */

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20

// Per-instance, in-memory. Serverless means this resets on cold start and isn't shared across
// instances, so it is a speed bump against casual scraping rather than a hard guarantee.
const hits = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(key: string): boolean {
	const now = Date.now()
	const bucket = hits.get(key)

	if (!bucket || now > bucket.resetAt) {
		hits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
		// Opportunistic sweep so the map can't grow without bound on a long-lived instance.
		if (hits.size > 5000) {
			for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k)
		}
		return false
	}

	bucket.count += 1
	return bucket.count > RATE_LIMIT_MAX
}

function clientKey(req: NextApiRequest): string {
	const forwarded = req.headers["x-forwarded-for"]
	const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
	return (raw?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown").toLowerCase()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		if (req.method !== "POST") {
			return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
		}

		const { email, eventId } = req.body || {}

		if (!email || !eventId) {
			return sendResponse(res, null, "Email and event ID are required", false, ResCode.BAD_REQUEST)
		}

		if (!Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Invalid event ID", false, ResCode.BAD_REQUEST)
		}

		if (isRateLimited(clientKey(req))) {
			return sendResponse(res, null, "Too many requests. Please slow down.", false, ResCode.TOO_MANY_REQUESTS)
		}

		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			await dbconn.asPromise()
		}

		const { Events } = await import("@/models/events")
		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
			.select("tickets.includesPremium")
			.lean()

		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// No ticket here sells a membership — answer without looking the address up at all.
		if (!eventHasAnyPremiumTicket(event as any)) {
			return sendResponse(res, { isPremiumMember: false, sellsPremium: false }, "No membership sold on this event", true, ResCode.OK)
		}

		// Membership status and remaining allowance are answered together: the modal needs
		// both off the same debounced keystroke, and splitting them would mean two requests
		// and two rate-limit buckets for one question.
		const [isPremiumMember, allowance] = await Promise.all([
			isPremiumEmail(String(email)),
			getPremiumTicketAllowance(String(eventId), String(email)),
		])

		return sendResponse(
			res,
			{
				isPremiumMember,
				sellsPremium: true,
				// How many Premium tickets this address may still buy FOR THIS EVENT.
				premiumTicketLimit: allowance.limit,
				premiumTicketsUsed: allowance.used,
				premiumTicketsRemaining: allowance.remaining,
			},
			isPremiumMember ? "Premium member" : "Not a premium member",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[premium/check-email] Error:", error)
		return sendResponse(res, null, "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
