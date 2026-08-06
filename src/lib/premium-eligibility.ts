/**
 * "Which memberships does this buyer already have?" — one answer, used everywhere.
 *
 * The authority is the EMAIL ON THE CHECKOUT FORM, not the NextAuth session.
 *
 * That is deliberate. The booking, the ticket email, the QR code and the auto-created Jetzy
 * account all attach to whatever email was typed into the checkout form. Reading the session
 * instead meant three different things went wrong at once:
 *
 *   - a guest who already pays for a membership wasn't recognised, silently, having no session;
 *   - a logged-in member who typed a different email had someone else's address treated as
 *     their own;
 *   - the modal preview and the Stripe charge could quote different totals.
 *
 * Resolving off the email collapses all three into one rule that the client preview, the
 * Stripe session, the booking record and the confirmation email can all agree on.
 *
 * Under the bundle model this decides whether MONEY IS CHARGED, not merely how much comes
 * off: a ticket selling a membership charges the subscription to everyone except an existing
 * member of THAT product. Getting it wrong either double-bills a subscriber or hands someone
 * a membership they weren't billed for.
 *
 * TRADE-OFF (accepted, deliberate): this lets an unauthenticated caller learn whether an
 * address has a membership. `/api/premium/check-email` limits the blast radius — it only
 * answers for events that actually sell a membership, and returns no PII.
 *
 * SERVER ONLY — this module loads the user models. React components that need to know
 * which memberships a ticket sells must import `@/lib/premium-bundle` instead, which is
 * pure and isomorphic.
 */

import { MEMBERSHIPS, MEMBERSHIP_KEYS, type MembershipKey } from "@/lib/memberships"

/**
 * Escape a user-supplied string for safe use inside a RegExp literal.
 * Same helper, same reason, as `booking-identity.ts`.
 */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Every membership this address currently holds.
 *
 * Looks in BOTH user collections, mirroring `findUserRecord` in `premium.ts` — an account
 * can live in `Users` or `EventUsers` interchangeably (see `[...nextauth].ts`) — and reads
 * BOTH accounts when the address exists in each, because a membership bought through one
 * still belongs to that person.
 *
 * MUST be case-insensitive: neither `Users.email` nor `EventUsers.email` declares
 * `lowercase: true`, so a subscriber who signed up as `Fahad@Example.com` would never be
 * found by an exact match against the lowercased address they type at checkout. This is the
 * same trap already documented for `Bookings.customerEmail`.
 */
export async function heldMemberships(email: string): Promise<MembershipKey[]> {
	const trimmed = typeof email === "string" ? email.trim() : ""
	if (!trimmed) return []

	const { Users } = await import("@/models/userModal")
	const { EventUsers } = await import("@/models/eventUsersModal")

	const emailMatch = { email: { $regex: `^${escapeRegex(trimmed)}$`, $options: "i" } }
	// Only the `active` flags are projected — callers never need more than the booleans, and
	// this keeps subscription ids and dates out of anything an unauthenticated endpoint could
	// leak.
	const projection = MEMBERSHIP_KEYS.map((key) => `${MEMBERSHIPS[key].userField}.active`).join(" ")

	const [inUsers, inEventUsers] = await Promise.all([
		Users.findOne(emailMatch).select(projection).lean(),
		EventUsers.findOne(emailMatch).select(projection).lean(),
	])

	return MEMBERSHIP_KEYS.filter((key) => {
		const field = MEMBERSHIPS[key].userField
		return !!(inUsers as any)?.[field]?.active || !!(inEventUsers as any)?.[field]?.active
	})
}

/** Is this address an active member of one specific product? */
export async function hasMembership(email: string, key: MembershipKey): Promise<boolean> {
	return (await heldMemberships(email)).includes(key)
}

/** @deprecated Premium-only shim. Use `hasMembership(email, "premium")`. */
export async function isPremiumEmail(email: string): Promise<boolean> {
	return hasMembership(email, "premium")
}
