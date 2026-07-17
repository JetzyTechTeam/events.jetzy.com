import { BookingStatus } from "@/models/events/types"

/**
 * True when a booking is inactive (cancelled or rejected). Single source of truth
 * for the "struck-through / not-counted" check across guests, bookings and check-in.
 */
export const isCancelledBooking = (b?: { status?: string } | null) =>
	b?.status === BookingStatus.CANCELLED || b?.status === BookingStatus.REJECTED

/** True when a booking is awaiting host approval (Require Approval flow). */
export const isPendingBooking = (b?: { status?: string } | null) =>
	b?.status === BookingStatus.PENDING
