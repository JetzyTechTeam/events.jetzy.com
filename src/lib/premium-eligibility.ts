/**
 * "Does this buyer get the Jetzy Premium member rate?" — one answer, used everywhere.
 *
 * The authority is the EMAIL ON THE CHECKOUT FORM, not the NextAuth session.
 *
 * That is deliberate. The booking, the ticket email, the QR code and the auto-created Jetzy
 * account all attach to whatever email was typed into the checkout form. Granting the
 * discount off the session instead meant three different things went wrong at once:
 *
 *   - a guest who pays for Premium got no discount, silently, because there was no session;
 *   - a logged-in member who typed a different email got the discount on a booking that
 *     belonged to someone else's address;
 *   - the modal preview and the Stripe charge could quote different totals.
 *
 * Resolving off the email collapses all three into one rule that the client preview, the
 * Stripe coupon, the booking record and the confirmation email can all agree on.
 *
 * TRADE-OFF (accepted, deliberate): this lets an unauthenticated caller learn whether an
 * address has a Premium subscription, and claim a member rate using someone else's address.
 * `/api/premium/check-email` limits the blast radius — it only answers for events that
 * actually offer a member rate, and returns no PII. The ticket still goes to the typed
 * address, so a discount claimed against a stranger's email buys a ticket you never receive.
 */

import { eventMemberDiscountPercentage } from "@/lib/premium-discount"

/**
 * SERVER ONLY — this module loads the user models. React components that need the
 * event-level rate must import `@/lib/premium-discount` instead.
 */

/**
 * Escape a user-supplied string for safe use inside a RegExp literal.
 * Same helper, same reason, as `booking-identity.ts`.
 */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

type EventLike = { premium?: boolean; premiumMemberDiscountPercentage?: number } | null | undefined

export { eventMemberDiscountPercentage }

/**
 * Is this address attached to an account with an active Premium subscription?
 *
 * Looks in BOTH user collections, mirroring `findUserRecord` in `premium.ts` — an account
 * can live in `Users` or `EventUsers` interchangeably (see `[...nextauth].ts`).
 *
 * MUST be case-insensitive: neither `Users.email` nor `EventUsers.email` declares
 * `lowercase: true`, so a subscriber who signed up as `Fahad@Example.com` would never be
 * found by an exact match against the lowercased address they type at checkout. This is the
 * same trap already documented for `Bookings.customerEmail`.
 */
export async function isPremiumEmail(email: string): Promise<boolean> {
	const trimmed = typeof email === "string" ? email.trim() : ""
	if (!trimmed) return false

	const { Users } = await import("@/models/userModal")
	const { EventUsers } = await import("@/models/eventUsersModal")

	const emailMatch = { email: { $regex: `^${escapeRegex(trimmed)}$`, $options: "i" } }
	const activeOnly = { ...emailMatch, "premiumSubscription.active": true }

	// Projected down to a single field — callers only ever need the boolean, and this keeps
	// subscription ids and dates out of anything an unauthenticated endpoint could leak.
	const inUsers = await Users.findOne(activeOnly).select("_id").lean()
	if (inUsers) return true

	const inEventUsers = await EventUsers.findOne(activeOnly).select("_id").lean()
	return !!inEventUsers
}

/**
 * Authoritative resolution for a checkout: the percentage to actually discount, or 0.
 *
 * Callers must NOT re-derive this. The result feeds `buildTicketPricing`'s
 * `premiumPercentage` and the combined Stripe coupon, where the member rate comes off first
 * and a referral code takes its cut off the remainder.
 *
 * Errors propagate. A failed lookup must not be silently downgraded to "no discount" — the
 * buyer was quoted a discounted total, and charging them in full instead is worse than
 * making them retry (same rule as the coupon-creation branch in `checkout/index.ts`).
 */
export async function resolveMemberDiscountPercentage(event: EventLike, email: string): Promise<number> {
	const pct = eventMemberDiscountPercentage(event)
	// Short-circuit before touching the user collections: an event with no member rate has
	// nothing to look up, and skipping the query keeps the enumeration surface narrow.
	if (pct === 0) return 0

	return (await isPremiumEmail(email)) ? pct : 0
}
