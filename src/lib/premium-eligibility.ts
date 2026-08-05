/**
 * "Does this buyer already have Jetzy Premium?" — one answer, used everywhere.
 *
 * The authority is the EMAIL ON THE CHECKOUT FORM, not the NextAuth session.
 *
 * That is deliberate. The booking, the ticket email, the QR code and the auto-created Jetzy
 * account all attach to whatever email was typed into the checkout form. Reading the session
 * instead meant three different things went wrong at once:
 *
 *   - a guest who already pays for Premium wasn't recognised, silently, having no session;
 *   - a logged-in member who typed a different email had someone else's address treated as
 *     their own;
 *   - the modal preview and the Stripe charge could quote different totals.
 *
 * Resolving off the email collapses all three into one rule that the client preview, the
 * Stripe session, the booking record and the confirmation email can all agree on.
 *
 * Under the bundle model this decides whether MONEY IS CHARGED, not merely how much comes
 * off: a ticket with `includesPremium` charges the subscription to everyone except an
 * existing member. Getting it wrong either double-bills a subscriber or hands someone a
 * membership they weren't billed for.
 *
 * TRADE-OFF (accepted, deliberate): this lets an unauthenticated caller learn whether an
 * address has a Premium subscription. `/api/premium/check-email` limits the blast radius —
 * it only answers for events that actually sell a membership, and returns no PII.
 *
 * SERVER ONLY — this module loads the user models. React components that need to know
 * whether a ticket sells a membership must import `@/lib/premium-bundle` instead, which is
 * pure and isomorphic.
 */

/**
 * Escape a user-supplied string for safe use inside a RegExp literal.
 * Same helper, same reason, as `booking-identity.ts`.
 */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

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

