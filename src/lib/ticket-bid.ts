/**
 * Bid tickets ("name your price") — pure and isomorphic. The ticket card, the checkout modal and
 * both checkout endpoints use these, so the slider can never offer what the server refuses.
 *
 * CEO, 2026-11-26: the guest sets what they pay between a host-set minimum and maximum (the slider
 * starts at the suggested price), checks out normally, and the bid becomes an approval request —
 * the card is HELD for the bid and charged only when the host approves (the existing manual-capture
 * hold, ~7-day expiry). Decided with the product owner:
 *   - each bid is a SEPARATE request, one seat, its own hold (more seats = more bids);
 *   - sealed — no guest sees another's bid;
 *   - a bid ticket ALWAYS needs approval, sells no membership, takes no referral discount, is
 *     never free and has no waiting list.
 *
 * Ticket fields (all optional, NO default — absent = an ordinary fixed-price ticket):
 *   `pricingMode: "bid"`, `bidMin`, `bidMax`, `bidSuggested` (major units). `price` holds the
 *   suggested amount, so the Stripe price/product and every list display keep working.
 */

export const BID_MIN_FLOOR = 0.5 // Stripe's smallest charge — and a $0 bid would have nothing to hold
export const BID_STEP = 1 // slider step; a typed amount may carry cents

export type BidTicketLike = {
	pricingMode?: string | null
	bidMin?: number | string | null
	bidMax?: number | string | null
	bidSuggested?: number | string | null
	price?: number | string | null
} | null | undefined

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: unknown) => (v === null || v === undefined || v === "" ? NaN : Number(v))

export const isBidTicket = (t: BidTicketLike): boolean => t?.pricingMode === "bid"

/** The range a bid ticket accepts. `suggested` falls back to the minimum. */
export function bidRange(t: BidTicketLike): { min: number; max: number; suggested: number } | null {
	if (!isBidTicket(t)) return null
	const min = num(t!.bidMin)
	const max = num(t!.bidMax)
	if (!Number.isFinite(min) || !Number.isFinite(max)) return null
	const s = num(t!.bidSuggested)
	return { min, max, suggested: Number.isFinite(s) ? s : min }
}

export const formatBidMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "usd" })

/** Host side: is this min / suggested / max a valid bid range? Returns the problem, or null. */
export function bidRangeProblem(r: { min?: unknown; max?: unknown; suggested?: unknown }): string | null {
	const min = num(r.min)
	const max = num(r.max)
	const suggested = num(r.suggested)
	if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(suggested)) return "Set a minimum, suggested and maximum bid."
	if (min < BID_MIN_FLOOR) return `The minimum bid must be at least ${formatBidMoney(BID_MIN_FLOOR)}.`
	if (max < min) return "The maximum bid can't be lower than the minimum."
	if (suggested < min || suggested > max) return "The suggested bid must be between the minimum and the maximum."
	if ([min, max, suggested].some((v) => round2(v) !== v)) return "Bids can have at most 2 decimals."
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

/** Clamp a slider / typed value into the range (UI only — the server validates, never clamps). */
export function clampBid(t: BidTicketLike, amount: number): number {
	const range = bidRange(t)
	if (!range || !Number.isFinite(amount)) return range?.suggested ?? 0
	return round2(Math.min(range.max, Math.max(range.min, amount)))
}

/**
 * The price ONE ticket on this booking was bought at: the bid when the booking carries one, else
 * the ticket's list price. Every reader that used to rebuild a booking's money from the CURRENT
 * list price goes through this — a bid booking would otherwise read as the suggested price.
 */
export function bookingUnitPrice(booking: { bidAmount?: number | null } | null | undefined, ticket: { price?: number | string | null } | null | undefined): number {
	const bid = Number(booking?.bidAmount)
	if (booking?.bidAmount !== undefined && booking?.bidAmount !== null && Number.isFinite(bid)) return bid
	return Number(ticket?.price) || 0
}

/** The bid fields to carry when a ticket is mapped into a form (every ticket surface uses this). */
export const ticketBidFields = (t: BidTicketLike): { pricingMode?: "bid"; bidMin?: number; bidMax?: number; bidSuggested?: number } =>
	isBidTicket(t)
		? { pricingMode: "bid", bidMin: Number(t!.bidMin), bidMax: Number(t!.bidMax), bidSuggested: Number(t!.bidSuggested) }
		: {}
