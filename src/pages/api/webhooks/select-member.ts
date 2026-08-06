import { createHash, timingSafeEqual } from "crypto"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { findActiveSubscriptionForProduct, getStripeClient, getUserStripeCustomerId } from "@/lib/premium"
import { heldMemberships } from "@/lib/premium-eligibility"

/**
 * Inbound webhook from selectmember.jetzy.com: "this member cancelled on our side".
 *
 * The Full Concierge membership is BILLED BY US when it rides along with a ticket, but it is
 * displayed and managed on their site. Without this endpoint a member who cancels there keeps
 * being charged by Jetzy indefinitely, with nothing in either product telling them why — the
 * single worst failure mode of splitting one subscription across two systems.
 *
 * ---- Why this one is authenticated when theirs is not ----
 *
 * Their outbound endpoints are deliberately open; that is their call, and their backend dev
 * flagged the consequence in writing. Ours is different in kind: it can STOP SOMEONE'S
 * BILLING. Unauthenticated, anyone who guessed an email could cancel that member's
 * subscription. `SELECT_MEMBER_WEBHOOK_SECRET`, compared in constant time.
 *
 * ---- Cancel at period end, not immediately ----
 *
 * Matches what the Stripe billing portal already does, and it is the honest behaviour: the
 * member has paid for the current period. Immediate cancellation would take access they are
 * owed and there are no refunds in this system to make it good.
 *
 * Cancelling in Stripe raises `customer.subscription.updated`, which writes
 * `conciergeSubscription` and mirrors the state back to them — so their record converges even
 * if their own write failed.
 */

const MEMBERSHIP_KEY = "concierge" as const

const secretMatches = (provided: string, expected: string): boolean => {
	// Hash both sides first so `timingSafeEqual` never sees mismatched lengths (it throws),
	// which would itself leak the secret's length.
	const a = createHash("sha256").update(provided).digest()
	const b = createHash("sha256").update(expected).digest()
	return timingSafeEqual(a, b)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ success: false, message: "Method not allowed" })
	}

	const expected = process.env.SELECT_MEMBER_WEBHOOK_SECRET
	if (!expected) {
		// Refuse rather than run unauthenticated. An endpoint that cancels subscriptions must
		// never be reachable because a deploy forgot an env var.
		console.error("[webhooks/select-member] SELECT_MEMBER_WEBHOOK_SECRET is not configured")
		return res.status(503).json({ success: false, message: "Webhook not configured" })
	}

	const headerValue = req.headers["x-webhook-secret"]
	const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue
	if (!provided || !secretMatches(provided, expected)) {
		console.warn("[webhooks/select-member] Rejected a request with a bad or missing secret")
		return res.status(401).json({ success: false, message: "Unauthorized" })
	}

	const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {}
	const email = typeof body?.email === "string" ? body.email.trim() : ""
	const status = typeof body?.status === "string" ? body.status.toLowerCase() : ""

	if (!email) {
		return res.status(400).json({ success: false, message: "email is required" })
	}
	// Only cancellation is accepted. Activation must originate from a real payment in our
	// Stripe account — accepting "active" here would let their side hand out a membership
	// nobody was billed for.
	if (status !== "cancelled" && status !== "canceled") {
		return res.status(400).json({ success: false, message: 'Only { status: "cancelled" } is accepted here' })
	}

	try {
		await ensureDbConnected()

		const { Users } = await import("@/models/userModal")
		const { EventUsers } = await import("@/models/eventUsersModal")

		// Case-insensitive by necessity: neither collection declares `lowercase: true` on
		// `email`, so an exact match misses anyone who signed up with capitals. Same trap as
		// `premium-eligibility.ts` and `booking-identity.ts`.
		const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		const match = { email: { $regex: `^${escaped}$`, $options: "i" } }
		const doc = (await Users.findOne(match)) || (await EventUsers.findOne(match))

		const customerId = getUserStripeCustomerId(doc)
		if (!customerId) {
			// Nothing of ours is billing them. Report it as handled — their side has already
			// cancelled and a 4xx would just make them retry something that can't succeed.
			console.warn("[webhooks/select-member] No Stripe customer for", email, "— nothing to cancel")
			return res.status(200).json({ success: true, message: "No Jetzy-billed membership for this address", cancelled: false })
		}

		const subscription = await findActiveSubscriptionForProduct(customerId, MEMBERSHIP_KEY)
		if (!subscription) {
			console.warn("[webhooks/select-member] No active Concierge subscription for", email)
			return res.status(200).json({ success: true, message: "No active Concierge subscription", cancelled: false })
		}

		if (subscription.cancel_at_period_end) {
			return res.status(200).json({
				success: true,
				message: "Already scheduled to cancel",
				cancelled: true,
				endsOn: new Date(subscription.current_period_end * 1000).toISOString(),
			})
		}

		const updated = await getStripeClient().subscriptions.update(subscription.id, { cancel_at_period_end: true })

		// Sanity log, not a guard: if this shows a Premium subscription was touched, the
		// product-identification work has regressed.
		console.log("[webhooks/select-member] Scheduled Concierge cancellation:", {
			email,
			subscriptionId: updated.id,
			endsOn: new Date(updated.current_period_end * 1000).toISOString(),
			stillHolds: await heldMemberships(email),
		})

		return res.status(200).json({
			success: true,
			message: "Concierge membership will end at the close of the current billing period",
			cancelled: true,
			endsOn: new Date(updated.current_period_end * 1000).toISOString(),
		})
	} catch (error: any) {
		console.error("[webhooks/select-member] Handler error:", error?.message || error)
		return res.status(500).json({ success: false, message: "Failed to cancel the membership" })
	}
}

function safeParse(raw: string): any {
	try {
		return JSON.parse(raw)
	} catch {
		return {}
	}
}
