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
 * A bundled ticket cannot also require approval.
 *
 * Approval holds work by authorizing the card and capturing later
 * (`payment_intent_data.capture_method: "manual"`), and Stripe documents
 * `payment_intent_data` as applying to `payment` mode only — there is no manual capture in
 * subscription mode. Rather than let a host configure something that cannot be charged, the
 * combination is rejected in the event forms and in the create/update schemas.
 */
export const BUNDLE_APPROVAL_CONFLICT_MESSAGE =
	"A ticket that includes Jetzy Premium can't also require approval — the membership starts billing immediately, so the payment can't be held."

export const hasBundleApprovalConflict = (ticket?: BundleTicketLike | null): boolean =>
	ticketIncludesPremium(ticket) && ticket?.requireApproval === true

/** A bundled ticket must cost something — there is no free path that can start a subscription. */
export const BUNDLE_FREE_TICKET_MESSAGE =
	"A ticket that includes Jetzy Premium must have a price — a free registration can't start a subscription."
