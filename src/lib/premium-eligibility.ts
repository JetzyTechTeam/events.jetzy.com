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

import { MEMBERSHIPS, MEMBERSHIP_KEYS, expandEntitlements, membershipsIncluding, type MembershipKey } from "@/lib/memberships"

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
 *
 * Returns ENTITLEMENTS, not just subscriptions: a Concierge member holds Premium too, because
 * Concierge includes it (`MEMBERSHIPS.concierge.includes`). So a ticket selling Premium never
 * charges a Concierge member for it, and `approve.ts` releases the Premium part of their hold.
 * When `scope` asks about Premium, Concierge is consulted as well — including on
 * selectmember.jetzy.com, where most Concierge members live.
 */
export async function heldMemberships(email: string, scope?: MembershipKey[]): Promise<MembershipKey[]> {
	return (await membershipHoldings(email, scope)).held
}

/**
 * `heldMemberships` with the WHY: `own` is what the address actually subscribes to; `held` adds
 * what those include. `includedWith` names, for each membership held only through another, the
 * one that includes it (`{ premium: "concierge" }`) — so copy can say "included with your
 * Concierge" rather than calling a Concierge member a Premium subscriber.
 */
export async function membershipHoldings(
	email: string,
	scope?: MembershipKey[],
): Promise<{ own: MembershipKey[]; held: MembershipKey[]; includedWith: Partial<Record<MembershipKey, MembershipKey>> }> {
	const own = await ownMemberships(email, scope)
	const held = expandEntitlements(own)
	const includedWith: Partial<Record<MembershipKey, MembershipKey>> = {}
	held
		.filter((key) => !own.includes(key))
		.forEach((key) => {
			const via = own.find((k) => (MEMBERSHIPS[k].includes || []).includes(key))
			if (via) includedWith[key] = via
		})
	return { own, held, includedWith }
}

async function ownMemberships(email: string, scope?: MembershipKey[]): Promise<MembershipKey[]> {
	const trimmed = typeof email === "string" ? email.trim() : ""
	if (!trimmed) return []

	const { ensureDbConnected } = await import("@/configs/database")
	await ensureDbConnected()
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

	const held = MEMBERSHIP_KEYS.filter((key) => {
		const field = MEMBERSHIPS[key].userField
		return !!(inUsers as any)?.[field]?.active || !!(inEventUsers as any)?.[field]?.active
	})

	// ---- Ask the membership's own system, when it has one ----
	//
	// Our records only know about memberships WE sold. Full Concierge has been sold on
	// selectmember.jetzy.com since before this integration existed, and those subscribers have
	// no `conciergeSubscription` here — so on our own data they look like non-members. Left
	// alone, an existing Concierge member buying a bundled ticket would be charged $59.50 for a
	// membership they already pay for, and end up with two live subscriptions.
	//
	// Only consulted for products in `scope`, so an event that doesn't sell Concierge never
	// touches their API — this runs behind the unauthenticated `/api/premium/check-email` on a
	// debounced keystroke, and there is no reason to point that at a third party's site.
	//
	// A failed lookup falls back to our own record: strictly the behaviour we'd have had
	// anyway, never worse. Their outage must not block a purchase.
	// A key in scope can be satisfied by a membership that includes it, so those are looked up too.
	const lookup = new Set<MembershipKey>()
	;(scope || []).forEach((key) => {
		lookup.add(key)
		membershipsIncluding(key).forEach((including) => lookup.add(including))
	})
	const remoteKeys = MEMBERSHIP_KEYS.filter(
		(key) => lookup.has(key) && MEMBERSHIPS[key].selectMemberPlan && !held.includes(key),
	)
	if (remoteKeys.length > 0) {
		const { getSelectMembershipStatus } = await import("@/lib/select-member")
		const status = await getSelectMembershipStatus(trimmed)
		if (String(status?.status || "").toLowerCase() === "active") {
			remoteKeys.forEach((key) => held.push(key))
		}
	}

	return MEMBERSHIP_KEYS.filter((key) => held.includes(key))
}

/** Is this address an active member of one specific product? */
export async function hasMembership(email: string, key: MembershipKey): Promise<boolean> {
	return (await heldMemberships(email, [key])).includes(key)
}

/** @deprecated Premium-only shim. Use `hasMembership(email, "premium")`. */
export async function isPremiumEmail(email: string): Promise<boolean> {
	return hasMembership(email, "premium")
}
