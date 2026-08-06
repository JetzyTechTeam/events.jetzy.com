/**
 * Single source of truth for "which memberships does this ticket sell?".
 *
 * The old model discounted a ticket for existing members. That is gone. A ticket now
 * OPTIONALLY BUNDLES one or more memberships — Jetzy Premium, Full Concierge, or both:
 *
 *   - buyer already holds one  → that one isn't charged for;
 *   - buyer holds neither      → charge the ticket price PLUS the first period of each,
 *                                in one Stripe Checkout Session.
 *
 * The session is always `mode: "payment"`; the subscriptions are created by us afterwards
 * with a trial covering the period just paid for. See §4 of the plan and `checkout/index.ts`
 * for why: a Checkout Session can create at most ONE subscription, so a ticket selling two
 * memberships cannot use subscription mode at all, and one subscription carrying both
 * products would mean cancelling either cancels both.
 *
 * Kept free of server imports so client components can use it directly — the server-only
 * membership lookup lives in `premium-eligibility.ts`.
 */

import {
	MEMBERSHIPS,
	MEMBERSHIP_KEYS,
	membershipLabelList,
	sanitizeMembershipKeys,
	type MembershipKey,
} from "@/lib/memberships"
import { AUTH_HOLD_DAYS } from "@/lib/ticket-approval"

export type BundleTicketLike = {
	_id?: unknown
	id?: unknown
	/**
	 * @deprecated Superseded by `memberships`. Still read as the fallback so every ticket
	 * saved before the second product existed keeps selling Jetzy Premium — there is no
	 * backfill migration, exactly as with `premium` / `privateAccessCode`.
	 */
	includesPremium?: boolean
	memberships?: MembershipKey[] | null
	requireApproval?: boolean
	price?: number | string
	isSelected?: boolean
}

export type BundleEventLike = {
	tickets?: BundleTicketLike[] | null
}

const idOf = (t?: BundleTicketLike | null): string | undefined => {
	const raw = t?._id ?? t?.id
	return raw === undefined || raw === null ? undefined : String(raw)
}

/**
 * Which memberships does this ticket sell? THE resolver — never read either field directly.
 *
 * `memberships` wins when present, including when it is an empty array (a host who unticked
 * both boxes means none, regardless of a stale `includesPremium`). Only when the field is
 * absent entirely does the legacy boolean speak.
 */
export const ticketMemberships = (ticket?: BundleTicketLike | null): MembershipKey[] => {
	if (!ticket) return []
	if (Array.isArray(ticket.memberships)) return sanitizeMembershipKeys(ticket.memberships)
	return ticket.includesPremium ? ["premium"] : []
}

/** Does this specific ticket bundle any membership at all? */
export const ticketIncludesMembership = (ticket?: BundleTicketLike | null): boolean => ticketMemberships(ticket).length > 0

/** @deprecated Use `ticketIncludesMembership`. */
export const ticketIncludesPremium = ticketIncludesMembership

/** Resolve by ticket id against `event.tickets` — for callers holding only an id. */
export const ticketMembershipsById = (event?: BundleEventLike | null, ticketId?: string | null): MembershipKey[] => {
	if (!ticketId) return []
	return ticketMemberships((event?.tickets || []).find((t) => idOf(t) === String(ticketId)))
}

export const ticketIncludesPremiumById = (event?: BundleEventLike | null, ticketId?: string | null): boolean =>
	ticketMembershipsById(event, ticketId).length > 0

/** True when ANY ticket on the event bundles a membership — drives event-level copy. */
export const eventHasAnyPremiumTicket = (event?: BundleEventLike | null): boolean =>
	(event?.tickets || []).some(ticketIncludesMembership)

const isLive = (t: BundleTicketLike) => t.isSelected !== false

/**
 * Which memberships does the CURRENT selection sell? Union across the selected tickets.
 *
 * Ticket selection is single-select (`EventTicketsComponent`), so in practice this is one
 * ticket — but it is written over the whole selection so a future multi-select cart can't
 * silently drop a subscription line item.
 */
export const selectionMemberships = (tickets?: BundleTicketLike[] | null): MembershipKey[] => {
	const seen = new Set<MembershipKey>()
	;(tickets || []).forEach((t) => {
		if (!isLive(t)) return
		ticketMemberships(t).forEach((key) => seen.add(key))
	})
	return MEMBERSHIP_KEYS.filter((key) => seen.has(key))
}

export const selectionIncludesPremium = (tickets?: BundleTicketLike[] | null): boolean =>
	selectionMemberships(tickets).length > 0

/**
 * What does this order have to charge for?
 *
 * `alreadyHeld` comes from the CHECKOUT EMAIL via `premium-eligibility.hasMembership`, never
 * from the session — same rule as before, and it now decides whether money is charged rather
 * than merely how much comes off. Charging an existing subscriber for a second copy of the
 * same plan is a billing incident; skipping a charge for someone who isn't a member hands out
 * a membership nobody paid for.
 */
export type BundleMode = "none" | "bundle" | "already-member"

export type BundlePlan = {
	/** Everything the ticket sells, held or not — for copy. */
	selected: MembershipKey[]
	/** The subset actually being charged and created. */
	toCharge: MembershipKey[]
	/** The subset the buyer already pays for elsewhere. */
	alreadyHeld: MembershipKey[]
	mode: BundleMode
}

export const resolveBundlePlan = (
	tickets: BundleTicketLike[] | null | undefined,
	alreadyHeld: MembershipKey[],
): BundlePlan => {
	const selected = selectionMemberships(tickets)
	const held = selected.filter((key) => alreadyHeld.includes(key))
	const toCharge = selected.filter((key) => !alreadyHeld.includes(key))

	// "already-member" means NOTHING is left to sell — the order is an ordinary paid ticket.
	// A buyer who holds one of two still needs the bundle machinery for the other.
	const mode: BundleMode = selected.length === 0 ? "none" : toCharge.length === 0 ? "already-member" : "bundle"

	return { selected, toCharge, alreadyHeld: held, mode }
}

/** @deprecated Single-product shim. Use `resolveBundlePlan`. */
export const resolveBundleMode = (tickets: BundleTicketLike[] | null | undefined, isMember: boolean): BundleMode =>
	resolveBundlePlan(tickets, isMember ? [...MEMBERSHIP_KEYS] : []).mode

/**
 * A bundled ticket CAN require approval — but it is charged a different way.
 *
 * Stripe documents `payment_intent_data` (and therefore `capture_method: "manual"`) as
 * applying to `payment` mode only; there is no manual capture in subscription mode. The
 * membership is therefore held as a one-time line item alongside the ticket and the
 * subscription is created by us in `api/bookings/approve.ts` once the host approves — with a
 * trial covering the period that capture already paid for, so the buyer isn't billed twice.
 *
 * The alternative (capture the ticket now, bill the membership separately afterwards) was
 * rejected: that second charge is off-session and can be declined or demand 3-D Secure with
 * nobody present, leaving an approved booking and a valid ticket with no membership.
 *
 * HOST-FACING copy — "you approve the guest". The buyer-facing equivalent lives in
 * `EventCheckoutModel`. `AUTH_HOLD_DAYS` rather than a literal 7, because this sentence quotes
 * the deadline that `authExpiresAt` actually enforces and the two must not drift.
 */
export const bundleApprovalNotice = (keys: MembershipKey[]): string => {
	// Premium alone is the only combination reachable while Concierge is withheld from the
	// ticket form, so it gets the exact approved wording. Anything else has the membership
	// named instead, so a Concierge ticket can't claim "the first month's premium".
	const period =
		keys.length === 1 && keys[0] === "premium"
			? "the first month's premium"
			: `the first period of ${membershipLabelList(keys) || "the membership"}`

	return `Payment Hold: Cards are authorized for the ticket plus ${period} at checkout, but are only charged if you approve the guest within ${AUTH_HOLD_DAYS} days; after that, the membership renews monthly.`
}

/** @deprecated Premium-only wording. Use `bundleApprovalNotice`. */
export const BUNDLE_APPROVAL_NOTICE = bundleApprovalNotice(["premium"])

/** A bundled ticket must cost something — there is no free path that can start a subscription. */
export const bundleFreeTicketMessage = (keys: MembershipKey[]): string =>
	`A ticket that includes ${membershipLabelList(keys) || "a membership"} must have a price — a free registration can't start a subscription.`

export const BUNDLE_FREE_TICKET_MESSAGE = bundleFreeTicketMessage(MEMBERSHIP_KEYS)

/**
 * How many membership-bundled tickets one person may buy for a single event.
 *
 * Both numbers are 2 and are deliberately separate constants: the first bounds a single
 * order, the second bounds the person across every order they place for that event. Without
 * the second, three orders of two would quietly reach six.
 *
 * The limit is PER EVENT and PER PRODUCT, not lifetime — a repeat customer should not be
 * locked out of a third Premium event forever, and buying two Premium tickets should not
 * exhaust their Concierge allowance.
 */
export const PREMIUM_TICKET_MAX_PER_ORDER = 2
export const PREMIUM_TICKET_LIMIT_PER_EVENT = 2

export const premiumOrderCapMessage = (key?: MembershipKey) =>
	`You can buy at most ${PREMIUM_TICKET_MAX_PER_ORDER} ${key ? MEMBERSHIPS[key].label : "membership"} tickets in one order.`

/** Shown when the buyer has already used part or all of their allowance for this event. */
export const premiumAllowanceMessage = (remaining: number, key?: MembershipKey) => {
	const label = key ? MEMBERSHIPS[key].label : "membership"
	return remaining <= 0
		? `You've already bought the maximum of ${PREMIUM_TICKET_LIMIT_PER_EVENT} ${label} tickets for this event.`
		: `You can buy ${remaining} more ${label} ticket${remaining === 1 ? "" : "s"} for this event.`
}

/** Total quantity of tickets in a selection that sell the given membership (or any). */
export const membershipQuantityInSelection = (tickets: BundleTicketLike[] | null | undefined, key?: MembershipKey): number =>
	(tickets || []).reduce((sum, ticket) => {
		if (!isLive(ticket)) return sum
		const keys = ticketMemberships(ticket)
		if (key ? !keys.includes(key) : keys.length === 0) return sum
		return sum + (Number((ticket as any).quantity) || 0)
	}, 0)

export const premiumQuantityInSelection = (tickets?: BundleTicketLike[] | null): number =>
	membershipQuantityInSelection(tickets)
