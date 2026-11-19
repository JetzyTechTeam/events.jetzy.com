import { Types } from "mongoose"
import { BookingStatus } from "@/models/events/types"

/**
 * The bookings the check-in page counts and lists — SERVER ONLY (builds a Mongo filter).
 *
 * The SAME population the door accepts: `scan.ts` / `record.ts` / `validate.ts` refuse only
 * pending and cancelled/rejected/failed bookings (`isPendingBooking` / `isCancelledBooking`).
 * The stats tiles used to count `status: confirmed` alone, so a `checked_in` booking (written by
 * the mobile app) was let in at the door but missing from Total Bookings, and its check-ins pushed
 * Remaining below the truth. Stats and the list both use this, so a tile and its list agree.
 *
 * Classified by EXCLUSION — `status` is not a closed set. `isDeleted: { $ne: true }` because rows
 * written by the mobile app may carry no such field.
 */
export const DEAD_CHECK_IN_STATUSES = [
	BookingStatus.PENDING,
	BookingStatus.CANCELLED,
	BookingStatus.REJECTED,
	BookingStatus.FAILED,
	BookingStatus.REFUNDED,
]

export const liveCheckInBookingsFilter = (eventId: string) => ({
	eventId: new Types.ObjectId(eventId),
	isDeleted: { $ne: true },
	status: { $nin: DEAD_CHECK_IN_STATUSES },
})

/** Tickets on a booking, after any host edit (`tickets` is rewritten by update-tickets). */
export const bookingTicketTotal = (booking: { tickets?: Array<{ quantity?: number }> }) =>
	(booking.tickets || []).reduce((sum, t) => sum + (Number(t?.quantity) || 0), 0)
