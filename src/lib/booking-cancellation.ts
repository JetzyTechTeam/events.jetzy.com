import { isCancelledBooking } from "./booking-status"

/**
 * Cancellation rules, in one place. Never re-derive these inline.
 *
 * Jetzy issues NO REFUNDS — this is a product decision, not a missing feature. Cancelling a
 * booking whose payment was already captured releases the seat and keeps the money. Do not
 * add `stripe.refunds.create` here or anywhere else: there is no Stripe Connect in this
 * codebase, so every charge lands in Jetzy's own balance and Stripe does not return its
 * processing fee on a refund — a refund is a straight loss with nothing recovered.
 *
 * Releasing an *uncaptured* authorization hold is NOT a refund. It costs nothing, the guest
 * was never charged, and it must always happen (see api/bookings/cancel.ts).
 */

/** Where the money for a booking currently sits. */
export type MoneyState =
	/** No payment attached and nothing owed — a genuinely free ticket. */
	| "free"
	/** Funds authorized on the card but never taken. Cancelling releases them at zero cost. */
	| "hold"
	/** Money was actually taken. Cancelling does not give it back. */
	| "captured"
	/** A hold that is already gone — released, expired, or failed. Nothing to undo. */
	| "released"
	/**
	 * The booking has a non-zero total but no `payment` record, so we genuinely cannot say
	 * whether money moved. 238 bookings in production are in this state: some predate the
	 * `payment` sub-doc entirely, and `waiting-list/approve.ts` still creates confirmed
	 * bookings with a priced total and no payment at all.
	 *
	 * Must never be rendered as "free" (it may well have been paid) nor as "captured" (it
	 * may well not have been). Copy for this state stays conditional.
	 */
	| "unknown"

type PaymentLike = { status?: string | null; amount?: number | null } | null | undefined

type BookingLike = { status?: string; payment?: PaymentLike; total?: number | null } | null | undefined

type EventLike = { startsOn?: Date | string | null } | null | undefined

export const NON_REFUNDABLE_MESSAGE =
	"Bookings are non-refundable. Cancelling releases your seat but any payment already made will not be returned."

export const EVENT_STARTED_MESSAGE = "This event has already started, so the booking can no longer be cancelled."

export const bookingMoneyState = (booking: BookingLike): MoneyState => {
	const status = booking?.payment?.status
	if (!booking?.payment || !status) {
		return Number(booking?.total ?? 0) > 0 ? "unknown" : "free"
	}
	if (status === "authorized" || status === "capturing") return "hold"
	if (status === "captured") return "captured"
	return "released"
}

/** The amount at stake for the guest, in major units. */
export const bookingMoneyAmount = (booking: BookingLike): number =>
	Number(booking?.payment?.amount ?? booking?.total ?? 0) || 0

/**
 * Has the event begun?
 *
 * Deliberately compares the exact `startsOn` instant rather than reusing `getEventStatus`
 * from utils/eventSort — that helper treats the whole start *day* as not-yet-past, which is
 * right for badges and wrong for a cancellation cutoff. An event with no date at all (TBD /
 * date poll) has not started, so it stays cancellable.
 */
export const hasEventStarted = (event: EventLike, now: number = Date.now()): boolean => {
	if (!event?.startsOn) return false
	const startsOn = new Date(event.startsOn).getTime()
	if (Number.isNaN(startsOn)) return false
	return startsOn <= now
}

export type CancelEligibility = { allowed: boolean; reason?: string }

/**
 * Can the guest who made this booking cancel it themselves?
 * Hosts and admins bypass this — they may cancel at any time (see api/bookings/cancel.ts).
 */
export const canGuestCancel = (booking: BookingLike, event: EventLike, now: number = Date.now()): CancelEligibility => {
	if (!booking) return { allowed: false, reason: "Booking not found." }
	if (isCancelledBooking(booking)) return { allowed: false, reason: "This booking is no longer active." }
	if (hasEventStarted(event, now)) return { allowed: false, reason: EVENT_STARTED_MESSAGE }
	return { allowed: true }
}
