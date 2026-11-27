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
 * SUGGESTED BID (2026-11-28): OPTIONAL, and the host may hide it from guests
 * (`bidShowSuggested: false`, NO default — absent = show). A hidden suggestion is the host's own
 * reference (it is in the admin bid emails) and is NEVER revealed to a guest — not as the label,
 * the bid's starting amount, or the slider's end. With no visible suggestion a priced ticket's bid
 * starts at its normal price and a bid-only ticket's bid box starts EMPTY (`bidStartAmount` null).
 *
 * BID ONLY (2026-11-27): a ticket that takes bids and has NO normal price (`price` empty or 0) can
 * only be bought with a bid. The card says "Bid" instead of $0.00, and every endpoint refuses a
 * normal order on it (`BID_ONLY_REFUSAL`) — otherwise a $0 normal order would book it FREE.
 */

// Jetzy's minimum bid (2026-11-28). Stripe's own floor is $0.50, but an approved $0.50 bid nets
// about $0.19 after Stripe's 30¢ fee. A suggested bid must clear it too.
export const BID_MIN_FLOOR = 2
export const BID_MAX = 999999.99 // Stripe's largest single USD charge
export const BID_STEP = 1 // the slider moves in whole dollars; a typed amount may carry cents
export const BID_BUTTON_STEP = 5 // each tap of − / + (QA, 2026-11-27: $1 taps were too slow)
export const BID_SLIDER_MULTIPLE = 10 // the slider runs to 10× the ticket's price — a convenience, not a cap
// One person (by checkout email) may place at most this many bids on ONE ticket — every bid
// counts, whatever became of it (pending, approved, rejected, expired, cancelled). 2026-11-28.
export const BID_LIMIT_PER_TICKET = 5

/** Shown with every bid — the card, and the checkout modal. */
export const BID_APPROVAL_NOTICE = "Bids need host approval — bids that are too low may not be approved."

export type BidTicketLike = {
	pricingMode?: string | null
	bidSuggested?: number | string | null
	bidShowSuggested?: boolean | null
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

/** The host's suggested bid as stored, when it is a valid one — whether or not guests see it. */
export function bidSuggestedValue(t: BidTicketLike): number | null {
	if (!isBidTicket(t)) return null
	const s = num(t!.bidSuggested)
	return Number.isFinite(s) && s >= BID_MIN_FLOOR && s <= BID_MAX ? round2(s) : null
}

/** The suggested bid a GUEST may see: null when there is none or the host hid it. */
export const bidSuggestedVisible = (t: BidTicketLike): number | null => (t?.bidShowSuggested === false ? null : bidSuggestedValue(t))

/**
 * Where a guest's bid starts: the visible suggestion, else the normal price, else null — an empty
 * box (a bid-only ticket with nothing to show). Never a hidden suggestion.
 */
export function bidStartAmount(t: BidTicketLike): number | null {
	if (!isBidTicket(t)) return null
	const visible = bidSuggestedVisible(t)
	if (visible !== null) return visible
	const p = num(t!.price)
	return Number.isFinite(p) && p > 0 ? round2(clampToBounds(p)) : null
}

/**
 * What the slider's end is measured from: the higher of the normal price and the VISIBLE
 * suggestion. Null when neither exists (the UI then uses a fixed range).
 */
export function bidSliderReference(t: BidTicketLike): number | null {
	if (!isBidTicket(t)) return null
	const p = num(t!.price)
	const top = Math.max(Number.isFinite(p) && p > 0 ? p : 0, bidSuggestedVisible(t) ?? 0)
	return top > 0 ? top : null
}

/**
 * What a bid on this ticket may be: Stripe's bounds. `suggested` is where a bid starts
 * (`bidStartAmount`, the floor when the box starts empty) — used for clamping only.
 * Null when it takes no bids.
 */
export function bidRange(t: BidTicketLike): { min: number; max: number; suggested: number } | null {
	if (!isBidTicket(t)) return null
	return { min: BID_MIN_FLOOR, max: BID_MAX, suggested: bidStartAmount(t) ?? BID_MIN_FLOOR }
}

export const formatBidMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "usd" })

/** What a guest is told when their bid is under the minimum — friendly, and the same on the page
 *  and from the server. (The minimum is Stripe's smallest charge; the guest needn't hear that.) */
export const BID_TOO_LOW_MESSAGE = `Bids start at ${formatBidMoney(BID_MIN_FLOOR)} — please enter ${formatBidMoney(BID_MIN_FLOOR)} or more.`

/** What a guest is told once they have placed `BID_LIMIT_PER_TICKET` bids on a ticket. */
export const BID_LIMIT_MESSAGE = `You've placed ${BID_LIMIT_PER_TICKET} bids on this ticket — that's the most one person can place.`

/** Host side: is this a valid suggested bid? Returns the problem, or null. The suggestion is
 *  OPTIONAL — blank / null is fine; only a value that is set is checked. */
export function bidSuggestedProblem(value: unknown): string | null {
	const v = num(value)
	if (value === null || value === undefined || value === "") return null
	if (!Number.isFinite(v)) return "Enter a valid suggested bid."
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
	if (a < range.min) return { ok: false, error: BID_TOO_LOW_MESSAGE }
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

/**
 * The bid fields to carry when a stored ticket is mapped into a form or copied (every ticket
 * surface uses this). Only what is SET: no suggestion → no key; shown → no key (absent = show).
 * A form that CLEARS a suggestion sends `bidSuggested: null` itself — this never invents one.
 */
export const ticketBidFields = (t: BidTicketLike): { pricingMode?: "bid"; bidSuggested?: number; bidShowSuggested?: false } => {
	if (!isBidTicket(t)) return {}
	const suggested = bidSuggestedValue(t)
	return {
		pricingMode: "bid",
		...(suggested !== null ? { bidSuggested: suggested } : {}),
		...(t?.bidShowSuggested === false ? { bidShowSuggested: false as const } : {}),
	}
}
