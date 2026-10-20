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

import {
	MEMBERSHIPS,
	MEMBERSHIP_KEYS,
	expandEntitlements,
	membershipsIncluding,
	selectMemberPlanNames,
	type MembershipKey,
} from "@/lib/memberships"

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

	// A key in scope can be satisfied by a membership that includes it (Premium ← Concierge), so
	// those are looked up too.
	const lookup = new Set<MembershipKey>()
	;(scope || []).forEach((key) => {
		lookup.add(key)
		membershipsIncluding(key).forEach((including) => lookup.add(including))
	})
	const missing = () => MEMBERSHIP_KEYS.filter((key) => lookup.has(key) && !held.includes(key))

	// ---- Ask STRIPE, by email ----
	//
	// Our records only know memberships we could attach to an account here. selectmember.jetzy.com
	// sells Premium and Concierge (monthly AND annual, separate products) on the SAME Stripe
	// account, and a buyer of theirs may have no document in our collections at all — on our own
	// data they look like non-members, and a bundled ticket would charge them for a membership they
	// already pay for. Stripe is the one record both sites write to, so it answers for both.
	// SelectMember's own advice (2026-10-19): their status API can't yet tell Concierge from their
	// other plans, so Stripe is the more reliable check.
	//
	// Only for products in scope — this runs behind the unauthenticated `/api/premium/check-email`
	// on a debounced keystroke. A failure falls back below; it never blocks a purchase.
	let stripeFailed = false
	if (missing().length > 0) {
		const fromStripe = await membershipsInStripeByEmail(trimmed, missing())
		if (fromStripe === null) stripeFailed = true
		else fromStripe.forEach((key) => !held.includes(key) && held.push(key))
	}

	// ---- Then SelectMember's own status API, as a fallback ----
	//
	// Trusted only when it says WHICH plan: `includesPremium`, or a `plan` that is one of ours for
	// that membership. A bare `status: "active"` could be a hotels-only member, and reading it as
	// Concierge would give away Premium — that is accepted only while Stripe itself is unreachable,
	// which is the behaviour this had before the Stripe check existed.
	const remoteKeys = missing().filter((key) => MEMBERSHIPS[key].selectMemberPlan)
	if (remoteKeys.length > 0) {
		const { getSelectMembershipStatus } = await import("@/lib/select-member")
		const status = await getSelectMembershipStatus(trimmed)
		const active = String(status?.status || "").toLowerCase() === "active"
		const plan = typeof status?.plan === "string" ? status.plan : ""
		if (active) {
			remoteKeys.forEach((key) => {
				// Their backend now answers `isConcierge` / `includesPremium` explicitly (2026-10-20);
				// a known `plan` name counts too, for responses from before those fields.
				const named =
					(status as any)?.isConcierge === true ||
					(status as any)?.includesPremium === true ||
					(!!plan && selectMemberPlanNames(key).includes(plan))
				if (named || (stripeFailed && !plan)) held.push(key)
			})
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

/**
 * Which of `keys` does any Stripe customer with this email hold right now (`active`/`trialing`,
 * on any product of the membership)? Null when Stripe couldn't be asked — distinct from "none".
 *
 * Customer SEARCH, not `customers.list({ email })`: list matches the address exactly, and
 * neither site lowercases what it stores. One person can have a customer on each site.
 */
async function membershipsInStripeByEmail(email: string, keys: MembershipKey[]): Promise<MembershipKey[] | null> {
	const { liveMembershipSubscriptionsByEmail } = await import("@/lib/membership-upgrade")
	const live = await liveMembershipSubscriptionsByEmail(email)
	if (live === null) return null
	return MEMBERSHIP_KEYS.filter((key) => keys.includes(key) && live.some((sub) => sub.key === key))
}
