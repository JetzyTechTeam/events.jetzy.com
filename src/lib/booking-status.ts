import { BookingStatus } from "@/models/events/types"

/** True when a booking has been cancelled. Single source of truth for the cancelled check. */
export const isCancelledBooking = (b?: { status?: string } | null) =>
	b?.status === BookingStatus.CANCELLED
