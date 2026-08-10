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

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`

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

/**
 * What one ticket on this booking actually cost, before any discount.
 *
 * Bookings store no per-ticket price snapshot — but `subTotal` is the ticket total BEFORE
 * discounts, so for a single-row booking `subTotal / quantity` is the unit price that was in
 * force at purchase. Using the pre-discount figure is what makes this safe: a comped booking
 * still reports the price it was sold at, so a discount can never be mistaken for a price
 * change.
 *
 * Returns null when the booking has more than one ticket row, because `subTotal` is a single
 * number for the whole booking and there is no honest way to split it back out per type.
 * Checkout is single-select, so that is the rare legacy/mobile case.
 */
export const paidUnitPrice = (booking: BookingLike): number | null => {
	const rows = (booking?.tickets || []).filter((r) => !!r?.ticketId)
	if (rows.length !== 1) return null
	const quantity = Number(rows[0]?.quantity) || 0
	if (quantity <= 0) return null
	const subTotal = Number(booking?.subTotal ?? 0)
	if (!Number.isFinite(subTotal) || subTotal < 0) return null
	return subTotal / quantity
}

export type PriceChange = { paid: number; current: number; direction: "up" | "down"; label: string }

/**
 * Was this ticket bought at a different price than it lists for now?
 *
 * Hosts edit ticket prices after tickets have sold, and nothing recorded that the guest in
 * front of them paid the old one. Returns null when they match, when the booking is
 * multi-row, or when the ticket no longer exists — in none of those cases can we say anything
 * truthful.
 */
export const describePriceChange = (booking: BookingLike, currentPrice: number | null | undefined): PriceChange | null => {
	const paid = paidUnitPrice(booking)
	// `null`/`undefined` must be rejected BEFORE coercion: `Number(null)` is 0 and passes
	// `isFinite`, so a deleted ticket type would otherwise report "Paid $1.00 · now $0.00" —
	// inventing a price drop out of a ticket that simply no longer exists. A ticket genuinely
	// repriced to $0 is a real change and still reported, which is why 0 itself is allowed.
	if (paid === null || currentPrice === null || currentPrice === undefined) return null
	const current = Number(currentPrice)
	if (!Number.isFinite(current)) return null
	// Cent tolerance — these are floats built from division.
	if (Math.abs(paid - current) < 0.005) return null
	return {
		paid,
		current,
		direction: paid < current ? "up" : "down",
		label: `Paid ${money(paid)} · now ${money(current)}`,
	}
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
