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
	/** Billing interval the bundled membership is sold at. Undefined means monthly. */
	membershipInterval?: string | null
	/** Free months the HOST gives on every membership this ticket sells. Undefined means none. */
	membershipFreeMonths?: number | null
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

/**
 * Which billing interval does this ticket sell its membership at? THE resolver — never read
 * `membershipInterval` directly.
 *
 * `undefined` on the ticket means MONTHLY, which is what every ticket saved before annual
 * existed means, so no migration is needed and no default belongs on the schema.
 *
 * ONE interval per ticket rather than one per membership: only Jetzy Premium is sold annually,
 * so a per-membership map would be structure with nothing to say. A ticket set to annual that
 * also sells Full Concierge resolves Concierge at its own default — see
 * `findMembershipPriceForInterval`, which returns null rather than substituting, leaving that
 * decision to the caller.
 */
export const ticketMembershipInterval = (ticket?: BundleTicketLike | null): string =>
	ticket?.membershipInterval === "year" ? "year" : "month"

/**
 * The most free months a host may put on one ticket.
 *
 * Same ceiling as `ReferralCodes.freeMembershipMonths`, deliberately: the two are alternative
 * sources of the same gift and a host who can give 12 through a code should not be able to give
 * more — or less — by typing it on the ticket instead.
 */
export const MAX_MEMBERSHIP_FREE_MONTHS = 12

/**
 * How many months of the bundled membership does this ticket give away? THE resolver — never
 * read `membershipFreeMonths` directly.
 *
 * `undefined` means NONE, which is what every ticket saved before this field existed means, so no
 * migration is needed and no default belongs on the schema. Clamped and floored here rather than
 * trusted, because this number is read on the client for the disclosure and on the server for the
 * charge, and the two must not be able to differ.
 */
export const ticketMembershipFreeMonths = (ticket?: BundleTicketLike | null): number => {
	const raw = Math.floor(Number(ticket?.membershipFreeMonths))
	return Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_MEMBERSHIP_FREE_MONTHS) : 0
}

/** Resolve by ticket id, for callers holding only an id. */
export const ticketMembershipIntervalById = (event?: BundleEventLike | null, ticketId?: string | null): string => {
	if (!ticketId) return "month"
	return ticketMembershipInterval((event?.tickets || []).find((t) => idOf(t) === String(ticketId)))
}

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
 * Which interval does the CURRENT selection sell its memberships at?
 *
 * The FIRST selected ticket that sells a membership wins — deliberately the same rule
 * `api/checkout` uses to resolve the price, so the disclosure the buyer reads and the price
 * their card is charged can never come from different tickets. Selection is single-select
 * today, so the two only diverge in a hypothetical mixed cart, and even then they agree.
 *
 * Monthly when nothing bundled is selected.
 */
export const selectionMembershipInterval = (tickets?: BundleTicketLike[] | null): string =>
	ticketMembershipInterval((tickets || []).find((t) => isLive(t) && ticketIncludesMembership(t)))

/**
 * How many free months does the CURRENT selection give?
 *
 * The FIRST selected ticket that sells a membership wins — the same rule as
 * `selectionMembershipInterval`, and for the same reason: the months the buyer is shown and the
 * months their subscription is actually created with must never come from different tickets.
 */
export const selectionMembershipFreeMonths = (tickets?: BundleTicketLike[] | null): number =>
	ticketMembershipFreeMonths((tickets || []).find((t) => isLive(t) && ticketIncludesMembership(t)))

/**
 * How many months of THIS membership are free on THIS order? The single combine rule.
 *
 * Best offer wins. A buyer holding a code worth more than the ticket's own gift gets the code's
 * months; a code worth less — or worth nothing, which is what an ordinary discount code is —
 * never takes the host's gift away. They deliberately do not stack: two sources of free months
 * on one order is a giveaway nobody chose, and a host running a campaign on a ticket that
 * already gives a month would be giving three.
 *
 * The TICKET's months apply to every membership it sells, because the host set them on that
 * ticket knowing what it sells. A REFERRAL CODE's months stay Premium-only — unchanged decision:
 * Full Concierge is sold on selectmember.jetzy.com's terms, and a code is not the host making a
 * deliberate choice about that product.
 *
 * Used by `api/checkout`, `api/checkout/free-events` and `EventCheckoutModel` alike, so the
 * disclosure the buyer reads and the trial their subscription is created with are one number.
 */
export const resolveFreeMonthsForKey = (key: MembershipKey, ticketMonths: number, referralMonths: number): number =>
	Math.max(Number(ticketMonths) || 0, key === "premium" ? Number(referralMonths) || 0 : 0)

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
export const bundleApprovalNotice = (keys: MembershipKey[], interval?: string | null): string => {
	const annual = interval === "year"
	// Premium alone keeps the exact approved wording, which is what the vast majority of
	// bundled tickets are. Anything else has the membership named instead, so a Concierge
	// ticket — or one selling both — can't claim "the first month's premium".
	const period =
		keys.length === 1 && keys[0] === "premium"
			? annual ? "the first year's premium" : "the first month's premium"
			: `the first period of ${membershipLabelList(keys) || "the membership"}`

	return `Payment Hold: Cards are authorized for the ticket plus ${period} at checkout, but are only charged if you approve the guest within ${AUTH_HOLD_DAYS} days; after that, the membership renews ${annual ? "yearly" : "monthly"}.`
}

/** @deprecated Premium-only wording. Use `bundleApprovalNotice`. */
export const BUNDLE_APPROVAL_NOTICE = bundleApprovalNotice(["premium"])

/**
 * A bundled ticket MAY be free. The membership is what is being sold, and it is charged in its
 * own right — so a $0 ticket sends a non-member to Stripe to pay for the membership alone, and
 * lets an existing member register instantly with nothing to collect.
 *
 * This used to be a hard rejection (`bundleFreeTicketMessage`) on the assumption that a
 * subscription needs a ticket charge to start against. It doesn't: the order carries the first
 * membership period as its own line item, and `setup_future_usage` saves the card for renewals.
 * The message survives as HOST GUIDANCE so the host knows what a $0 bundled ticket does, rather
 * than as an error that stops them saving it.
 */
export const bundleFreeTicketNotice = (keys: MembershipKey[]): string =>
	`This ticket is free, so non-members will be charged for ${membershipLabelList(keys) || "the membership"} only. Members already holding it register instantly at no charge.`

/** "1 month" / "3 months" — used wherever the gift has to be named to a host or a buyer. */
export const freeMonthsLabel = (months: number): string => `${months} month${months === 1 ? "" : "s"}`

/**
 * What a FREE ticket that also gives free months actually does — which is not what
 * `bundleFreeTicketNotice` describes.
 *
 * Nothing is charged at checkout, so there is no payment to speak of; but the buyer is still sent
 * to Stripe, because a subscription with no card on it is cancelled by Stripe when the trial ends
 * instead of converting. The host is choosing an order that collects card details and takes no
 * money, and that reads as a contradiction until it is spelled out.
 */
export const bundleFreeTrialTicketNotice = (keys: MembershipKey[], months: number): string =>
	`This ticket is free and the first ${freeMonthsLabel(months)} of ${membershipLabelList(keys) || "the membership"} ${
		months === 1 ? "is" : "are"
	} free too, so nothing is charged at checkout — but non-members are still taken to Stripe to save a card, or the membership would stop instead of renewing. Members already holding it register instantly.`

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
