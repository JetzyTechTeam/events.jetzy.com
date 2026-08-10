/**
 * What a booking was actually worth, and why.
 *
 * The host-facing surfaces kept answering this differently. The ticket cards on the manage
 * page computed revenue as `quantity × the ticket's CURRENT list price`, which is wrong twice
 * over: it ignores discounts, so three tickets comped to $0 with a 100%-off referral code
 * reported "$285.00 COLLECTED"; and it reads the price as it is now, so raising a ticket's
 * price retroactively inflates what past buyers appear to have paid.
 *
 * `booking.total` is the authority for TICKET money. Deliberately not `payment.amount` — on a
 * bundled order that also covers the first period of any membership sold with the ticket, so
 * using it would book subscription revenue against the ticket.
 *
 * Pure and isomorphic. No models, no Stripe.
 */

export type TicketRow = { ticketId?: unknown; quantity?: number }

export type BookingLike = {
	tickets?: TicketRow[] | null
	total?: number | null
	subTotal?: number | null
	discountAmount?: number | null
	referralCode?: string | null
	payment?: { status?: string; amount?: number } | null
}

/** Money is committed but not yet taken — an authorized hold, or one whose capture failed. */
export const isOnHold = (booking: BookingLike): boolean => {
	const status = booking?.payment?.status
	return status === "authorized" || status === "capturing" || status === "failed"
}

/**
 * Ticket revenue for one booking, in major units — what the guest actually owed after
 * discounts, not what the tickets list for.
 */
export const bookingTicketRevenue = (booking: BookingLike): number => Number(booking?.total ?? 0) || 0

/**
 * Split a booking's revenue across its ticket rows, in proportion to each row's share of the
 * list price. Ticket selection is single-select at checkout, so in practice there is one row
 * and it receives the whole amount; the apportioning exists so a multi-row booking (legacy, or
 * written by the mobile app) can't dump its full value onto every row it touches.
 *
 * `priceOf` supplies the list price used only for weighting. When the weights sum to zero —
 * every row free, or the ticket types since deleted — the revenue is zero anyway, so the split
 * is irrelevant and the first row takes it.
 */
export const apportionRevenue = (
	booking: BookingLike,
	priceOf: (ticketId: string) => number,
): Array<{ ticketId: string; quantity: number; revenue: number }> => {
	const rows = (booking?.tickets || []).filter((r) => !!r?.ticketId)
	if (rows.length === 0) return []

	const total = bookingTicketRevenue(booking)
	const weights = rows.map((r) => (Number(r.quantity) || 0) * priceOf(String(r.ticketId)))
	const weightSum = weights.reduce((sum, w) => sum + w, 0)

	return rows.map((r, i) => ({
		ticketId: String(r.ticketId),
		quantity: Number(r.quantity) || 0,
		revenue: weightSum > 0 ? (total * weights[i]) / weightSum : i === 0 ? total : 0,
	}))
}

export type DiscountInfo = {
	/** A discount actually reduced what was owed. */
	discounted: boolean
	/** The discount took the whole amount off. */
	comped: boolean
	amount: number
	code?: string
	/** "Free · SHAMAP100", "−$20.00 · EARLYBIRD", or undefined when nothing was discounted. */
	label?: string
}

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`

/**
 * How to describe the gap between what a booking listed for and what it cost.
 *
 * A $0 total has two very different causes — a genuinely free ticket, and a paid ticket
 * comped to nothing by a code — and a host approving a request needs to tell them apart.
 * Only the second names a code.
 */
export const describeDiscount = (booking: BookingLike): DiscountInfo => {
	const amount = Number(booking?.discountAmount ?? 0) || 0
	const code = booking?.referralCode?.trim() || undefined
	const subTotal = Number(booking?.subTotal ?? 0) || 0
	const total = bookingTicketRevenue(booking)

	if (amount <= 0) return { discounted: false, comped: false, amount: 0, code }

	// Comped means the discount is what made it free — not merely that it ended up at zero,
	// which a $0 ticket does on its own with no discount involved.
	const comped = total <= 0 && subTotal > 0
	return {
		discounted: true,
		comped,
		amount,
		code,
		label: comped ? (code ? `Free · ${code}` : "Free") : code ? `−${money(amount)} · ${code}` : `−${money(amount)}`,
	}
}
