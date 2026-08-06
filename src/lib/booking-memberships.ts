/**
 * Reading the memberships attached to a booking, without every call site having to know
 * about the shape it was written in.
 *
 * `payment.memberships` is the current form. Bookings taken before Full Concierge existed
 * carry a single membership in flat `premium*` fields instead — including live rows from the
 * approval work shipped days earlier, some of which are still PENDING and will be approved
 * against this code. Both shapes must read identically or those approvals charge a card and
 * then fail to start the membership.
 *
 * Pure — no models, no Stripe. Safe anywhere.
 */

import type { MembershipKey } from "@/lib/memberships"
import type { IBookingMembership, IBookingPayment } from "@/models/events/types"

/**
 * Every membership on this booking, legacy shape included.
 *
 * The legacy row is synthesised as `premium` because that was the only product that existed
 * when those fields were written — there is no ambiguity to resolve.
 */
export const bookingMemberships = (payment?: IBookingPayment | null): IBookingMembership[] => {
	if (!payment) return []

	const rows = payment.memberships
	if (Array.isArray(rows) && rows.length > 0) return rows

	if (payment.premiumStatus) {
		return [
			{
				key: "premium",
				status: payment.premiumStatus,
				amount: payment.premiumAmount,
				priceId: payment.premiumPriceId,
				interval: payment.premiumInterval,
				subscriptionId: payment.subscriptionId,
			},
		]
	}

	return []
}

export const bookingMembership = (payment: IBookingPayment | null | undefined, key: MembershipKey): IBookingMembership | undefined =>
	bookingMemberships(payment).find((row) => row.key === key)

/** Memberships still owed — held or paid for, but with no subscription behind them yet. */
export const pendingBookingMemberships = (payment?: IBookingPayment | null): IBookingMembership[] =>
	bookingMemberships(payment).filter((row) => row.status === "pending")

/**
 * Money on this booking that belongs to memberships rather than to the ticket.
 *
 * `payment.amount` is what the CARD was held for or charged; `booking.total` is the ticket
 * alone. This is the difference, and getting it wrong inflates every ticket total by the
 * membership fee (or understates what the guest sees on their statement).
 */
export const bookingMembershipTotal = (payment: IBookingPayment | null | undefined, rows?: IBookingMembership[]): number => {
	const list = rows || bookingMemberships(payment)
	const sum = list.reduce((total, row) => total + (Number(row.amount) || 0), 0)
	return Math.round((sum + Number.EPSILON) * 100) / 100
}
