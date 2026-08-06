/**
 * Single source of truth for "does this ticket sell a Jetzy Premium membership?".
 *
 * The old model discounted a ticket for existing members. That is gone. A ticket now
 * OPTIONALLY BUNDLES the membership:
 *
 *   - buyer is already a member  → charge the ticket price only;
 *   - buyer is not a member      → charge the ticket price PLUS the monthly subscription,
 *                                  in one Stripe Checkout Session.
 *
 * Stripe allows a `mode: "subscription"` session to carry one-time line items alongside the
 * recurring one; the one-time items land on the first invoice only and the subscription
 * renews by itself afterwards.
 *
 * Kept free of server imports so client components can use it directly — the server-only
 * membership lookup lives in `premium-eligibility.ts`.
 */

export type BundleTicketLike = {
	_id?: unknown
	id?: unknown
	includesPremium?: boolean
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

/** Does this specific ticket bundle a membership? */
export const ticketIncludesPremium = (ticket?: BundleTicketLike | null): boolean => !!ticket?.includesPremium

/** Resolve by ticket id against `event.tickets` — for callers holding only an id. */
export const ticketIncludesPremiumById = (event?: BundleEventLike | null, ticketId?: string | null): boolean => {
	if (!ticketId) return false
	return ticketIncludesPremium((event?.tickets || []).find((t) => idOf(t) === String(ticketId)))
}

/** True when ANY ticket on the event bundles a membership — drives event-level copy. */
export const eventHasAnyPremiumTicket = (event?: BundleEventLike | null): boolean =>
	(event?.tickets || []).some(ticketIncludesPremium)

/**
 * Does the CURRENT selection bundle a membership?
 *
 * Ticket selection is single-select (`EventTicketsComponent`), so in practice this is one
 * ticket — but it is written over the whole selection so a future multi-select cart can't
 * silently drop the subscription line item.
 */
export const selectionIncludesPremium = (tickets?: BundleTicketLike[] | null): boolean =>
	(tickets || []).some((t) => (t.isSelected === false ? false : ticketIncludesPremium(t)))

/**
 * What kind of Stripe Checkout Session does this order need?
 *
 *   "none"           → no membership involved; ordinary `mode: "payment"`.
 *   "already-member" → ticket bundles membership but the buyer already pays for it.
 *                      Charge the ticket alone, still `mode: "payment"`. Creating a second
 *                      subscription for someone who already has one is a billing incident.
 *   "bundle"         → `mode: "subscription"` with the ticket as a one-time line item.
 *
 * `isMember` is resolved from the CHECKOUT EMAIL by `premium-eligibility.isPremiumEmail`,
 * never from the session — same rule as before, and now it decides whether money is charged
 * rather than merely how much is taken off.
 */
export type BundleMode = "none" | "bundle" | "already-member"

export const resolveBundleMode = (tickets: BundleTicketLike[] | null | undefined, isMember: boolean): BundleMode => {
	if (!selectionIncludesPremium(tickets)) return "none"
	return isMember ? "already-member" : "bundle"
}

/**
 * A bundled ticket CAN require approval — but it is charged a different way.
 *
 * Stripe documents `payment_intent_data` (and therefore `capture_method: "manual"`) as
 * applying to `payment` mode only; there is no manual capture in subscription mode. So a
 * bundled ticket that needs approval cannot be sold as a subscription session at all.
 *
 * Instead it is sold as a `mode: "payment"` session holding ticket + the first membership
 * period as one manual-capture authorization, and the subscription is created by us in
 * `api/bookings/approve.ts` once the host approves — with a trial covering the period that
 * capture already paid for, so the buyer isn't billed twice.
 *
 * The alternative (capture the ticket now, bill the membership separately afterwards) was
 * rejected: that second charge is off-session and can be declined or demand 3-D Secure with
 * nobody present, leaving an approved booking and a valid ticket with no membership.
 */
export const BUNDLE_APPROVAL_NOTICE =
	"The card is held for the ticket plus the first membership period. Nothing is charged, and Jetzy Premium doesn't start, until you approve."

/** A bundled ticket must cost something — there is no free path that can start a subscription. */
export const BUNDLE_FREE_TICKET_MESSAGE =
	"A ticket that includes Jetzy Premium must have a price — a free registration can't start a subscription."

/**
 * How many Jetzy Premium tickets one person may buy for a single event.
 *
 * Both numbers are 2 and are deliberately separate constants: the first bounds a single
 * order, the second bounds the person across every order they place for that event. Without
 * the second, three orders of two would quietly reach six.
 *
 * The limit is PER EVENT, not lifetime — a repeat customer should not be locked out of a
 * third Premium event forever.
 */
export const PREMIUM_TICKET_MAX_PER_ORDER = 2
export const PREMIUM_TICKET_LIMIT_PER_EVENT = 2

export const premiumOrderCapMessage = () =>
	`You can buy at most ${PREMIUM_TICKET_MAX_PER_ORDER} Jetzy Premium tickets in one order.`

/** Shown when the buyer has already used part or all of their allowance for this event. */
export const premiumAllowanceMessage = (remaining: number) =>
	remaining <= 0
		? `You've already bought the maximum of ${PREMIUM_TICKET_LIMIT_PER_EVENT} Jetzy Premium tickets for this event.`
		: `You can buy ${remaining} more Jetzy Premium ticket${remaining === 1 ? "" : "s"} for this event.`

/** Total quantity of bundled tickets in a selection. */
export const premiumQuantityInSelection = (tickets?: BundleTicketLike[] | null): number =>
	(tickets || []).reduce((sum, ticket) => {
		if (ticket.isSelected === false || !ticketIncludesPremium(ticket)) return sum
		return sum + (Number((ticket as any).quantity) || 0)
	}, 0)
