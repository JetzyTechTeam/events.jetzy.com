/**
 * Bids ("name your price") — pure and isomorphic. The ticket card, the checkout modal and both
 * checkout endpoints use these, so the card can never offer what the server refuses.
 *
 * v2 (CEO, 2026-11-27): bidding is an OPTION ON A NORMAL TICKET, not a kind of ticket. The host
 * turns it on per ticket and sets ONE suggested price — no minimum, no maximum. The guest either
 * buys at the ticket's normal `price` (an ordinary order, approval only if the ticket has it on)
 * or names their own price. A BID always becomes an approval request whatever the ticket's
 * approval setting: the card is HELD for the bid and charged only when the host approves (the
 * existing manual-capture hold, ~7-day expiry). Each bid is one seat, its own request and hold;
 * sealed; no referral discount; never free; no membership (a ticket that takes bids sells none).
 *
 * Ticket fields (optional, NO default — absent = the ticket takes no bids):
 *   `pricingMode: "bid"` = this ticket ALSO accepts bids; `bidSuggested` = the suggested bid.
 *   `price` is the normal price. `bidMin` / `bidMax` (v1) are no longer written or read.
 *
 * WHETHER AN ORDER IS A BID is decided by the ORDER ROW (`isBidOrderRow`), never by the ticket.
 *
 * BID ONLY (2026-11-27): a ticket that takes bids and has NO normal price (`price` empty or 0) can
 * only be bought with a bid. The card says "Bid" instead of $0.00, and every endpoint refuses a
 * normal order on it (`BID_ONLY_REFUSAL`) — otherwise a $0 normal order would book it FREE.
 */

export const BID_MIN_FLOOR = 0.5 // Stripe's smallest charge — and a $0 bid would have nothing to hold
export const BID_MAX = 999999.99 // Stripe's largest single USD charge
export const BID_STEP = 1 // the slider moves in whole dollars; a typed amount may carry cents
export const BID_BUTTON_STEP = 5 // each tap of − / + (QA, 2026-11-27: $1 taps were too slow)
export const BID_SLIDER_MULTIPLE = 10 // the slider runs to 10× the ticket's price — a convenience, not a cap

/** Shown with every bid — the card, and the checkout modal. */
export const BID_APPROVAL_NOTICE = "Bids need host approval — a bid that's too low won't be accepted."

export type BidTicketLike = {
	pricingMode?: string | null
	bidSuggested?: number | string | null
	price?: number | string | null
} | null | undefined

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => (v === null || v === undefined || v === "" ? NaN : Number(v))
const clampToBounds = (n: number) => Math.min(BID_MAX, Math.max(BID_MIN_FLOOR, n))

/** Does this ticket accept bids (beside its normal price)? */
export const isBidTicket = (t: BidTicketLike): boolean => t?.pricingMode === "bid"

/** Does this ticket take ONLY bids — bids on, and no normal price? */
export const isBidOnlyTicket = (t: BidTicketLike): boolean => isBidTicket(t) && !(Number(t?.price) > 0)

/** What every endpoint answers a normal (non-bid) order on a bid-only ticket. */
export const BID_ONLY_REFUSAL = "This ticket only takes bids — place a bid to book it."

/** Is this ORDER ROW a bid? Only a row the buyer sent as a bid is one. */
export const isBidOrderRow = (row: { pricingMode?: string | null } | null | undefined): boolean => row?.pricingMode === "bid"

/**
 * What a bid on this ticket may be: Stripe's bounds, and the host's suggested price (falling back
 * to the ticket price, then the floor — always inside the bounds). Null when it takes no bids.
 */
export function bidRange(t: BidTicketLike): { min: number; max: number; suggested: number } | null {
	if (!isBidTicket(t)) return null
	const s = num(t!.bidSuggested)
	const p = num(t!.price)
	const suggested = Number.isFinite(s) ? s : Number.isFinite(p) && p > 0 ? p : BID_MIN_FLOOR
	return { min: BID_MIN_FLOOR, max: BID_MAX, suggested: round2(clampToBounds(suggested)) }
}

export const formatBidMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "usd" })

/** Host side: is this a valid suggested bid? Returns the problem, or null. */
export function bidSuggestedProblem(value: unknown): string | null {
	const v = num(value)
	if (!Number.isFinite(v)) return "Set a suggested bid."
	if (v < BID_MIN_FLOOR) return `The suggested bid must be at least ${formatBidMoney(BID_MIN_FLOOR)}.`
	if (v > BID_MAX) return `The suggested bid can't be more than ${formatBidMoney(BID_MAX)}.`
	if (round2(v) !== v) return "The suggested bid can have at most 2 decimals."
	return null
}

/** Server + client: is `amount` a bid this ticket accepts? */
export function validateBidAmount(t: BidTicketLike, amount: unknown): { ok: true; amount: number; cents: number } | { ok: false; error: string } {
	const range = bidRange(t)
	if (!range) return { ok: false, error: "This ticket isn't taking bids." }
	const a = num(amount)
	if (!Number.isFinite(a)) return { ok: false, error: "Enter your bid." }
	if (round2(a) !== a) return { ok: false, error: "A bid can have at most 2 decimals." }
	if (a < range.min) return { ok: false, error: `The lowest bid is ${formatBidMoney(range.min)}.` }
	if (a > range.max) return { ok: false, error: `The highest bid is ${formatBidMoney(range.max)}.` }
	return { ok: true, amount: a, cents: Math.round(a * 100) }
}

/** Clamp a typed / stepped value into the bounds (UI only — the server validates, never clamps). */
export function clampBid(t: BidTicketLike, amount: number): number {
	const range = bidRange(t)
	if (!range || !Number.isFinite(amount)) return range?.suggested ?? 0
	return round2(Math.min(range.max, Math.max(range.min, amount)))
}

/**
 * The price ONE ticket on this booking was bought at: the bid when the booking carries one, else
 * the ticket's list price. Every reader that used to rebuild a booking's money from the CURRENT
 * list price goes through this — a bid booking would otherwise read as the normal price.
 */
export function bookingUnitPrice(booking: { bidAmount?: number | null } | null | undefined, ticket: { price?: number | string | null } | null | undefined): number {
	const bid = Number(booking?.bidAmount)
	if (booking?.bidAmount !== undefined && booking?.bidAmount !== null && Number.isFinite(bid)) return bid
	return Number(ticket?.price) || 0
}

/** The bid fields to carry when a ticket is mapped into a form (every ticket surface uses this). */
export const ticketBidFields = (t: BidTicketLike): { pricingMode?: "bid"; bidSuggested?: number } =>
	isBidTicket(t) ? { pricingMode: "bid", bidSuggested: bidRange(t)!.suggested } : {}
