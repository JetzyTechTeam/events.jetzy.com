import { BookingStatus } from "@/models/events/types"

/**
 * True when a booking is inactive (cancelled, rejected, or a card hold that expired
 * before the host acted). Single source of truth for the "struck-through / not-counted"
 * check across guests, bookings and check-in.
 */
export const isCancelledBooking = (b?: { status?: string } | null) =>
	b?.status === BookingStatus.CANCELLED || b?.status === BookingStatus.REJECTED || b?.status === BookingStatus.FAILED

/** True when a booking is awaiting host approval (Require Approval flow). */
export const isPendingBooking = (b?: { status?: string } | null) =>
	b?.status === BookingStatus.PENDING

type WithPayment = { status?: string; payment?: { status?: string; authExpiresAt?: string | Date | null } | null } | null | undefined

/** Funds are authorized on the guest's card but not yet taken. */
export const isAuthorizedHold = (b?: WithPayment) => b?.payment?.status === "authorized"

/** Money has actually been taken. */
export const isCapturedBooking = (b?: WithPayment) => b?.payment?.status === "captured"

/** The last capture attempt failed. The booking stays PENDING so the host can retry. */
export const isCaptureFailed = (b?: WithPayment) => b?.payment?.status === "failed"

/**
 * The card hold can no longer be captured. Either Stripe already told us so via the
 * `payment_intent.canceled` webhook, or our own clock says the ~7 day window has passed
 * and the webhook simply hasn't landed yet.
 */
export const isHoldExpired = (b?: WithPayment) => {
	if (b?.payment?.status === "expired") return true
	if (b?.payment?.status !== "authorized" || !b?.payment?.authExpiresAt) return false
	return new Date(b.payment.authExpiresAt) < new Date()
}

/** Milliseconds until the hold lapses; negative once expired, null when there is no hold. */
export const holdTimeRemaining = (b?: WithPayment): number | null => {
	const expiresAt = b?.payment?.authExpiresAt
	if (!expiresAt) return null
	return new Date(expiresAt).getTime() - Date.now()
}

/**
 * Why a booking is dead. Three different things that used to render as one red
 * "Cancelled" badge on every host-facing surface:
 *
 *  - `cancelled` — somebody cancelled it after it was made (guest, host or admin;
 *    `booking.cancelledBy` records which).
 *  - `rejected`  — the host declined an approval request.
 *  - `expired`   — NOBODY acted. The ~7 day Stripe authorization lapsed before the host
 *    approved, so the request died on its own. `BookingStatus.FAILED` is only ever
 *    written for that (webhooks/stripe.ts `payment_intent.canceled`, and approve.ts
 *    finding the PI already canceled), always alongside `payment.status: "expired"`.
 *
 * Telling a host "cancelled" for the third one is backwards: the guest tried to come and
 * the request was left to time out. The guest-facing `BookingCard` has always drawn the
 * distinction; these labels are so the console can too.
 */
export type DeadBookingKind = "cancelled" | "rejected" | "expired"

export const deadBookingKind = (b?: { status?: string } | null): DeadBookingKind | null => {
	if (b?.status === BookingStatus.CANCELLED) return "cancelled"
	if (b?.status === BookingStatus.REJECTED) return "rejected"
	if (b?.status === BookingStatus.FAILED) return "expired"
	return null
}

export const DEAD_BOOKING_LABEL: Record<DeadBookingKind, string> = {
	cancelled: "Cancelled",
	rejected: "Rejected",
	expired: "Expired",
}

/** Expired is not the guest's doing, so it is greyed rather than red-flagged. */
export const DEAD_BOOKING_COLOR: Record<DeadBookingKind, string> = {
	cancelled: "red",
	rejected: "red",
	expired: "gray",
}

export const DEAD_BOOKING_TOOLTIP: Record<DeadBookingKind, string> = {
	cancelled: "This booking was cancelled after it was made. Nothing was refunded.",
	rejected: "The host declined this request. The card hold was released and the guest was never charged.",
	expired: "The card hold lapsed before this request was approved. The guest did not cancel and was never charged — the request timed out.",
}

/**
 * The same three facts told to the person they happened to. The host's copy talks ABOUT
 * the guest ("the guest was never charged"), which is the wrong voice on the guest's own
 * booking page — `/my-bookings` is the only surface that uses this one.
 */
export const DEAD_BOOKING_TOOLTIP_GUEST: Record<DeadBookingKind, string> = {
	cancelled: "This booking was cancelled. Any payment already taken is not refunded.",
	rejected: "The host could not approve this request. The hold on your card was released and you were not charged.",
	expired: "This request wasn't reviewed in time, so the hold on your card was released. You were not charged — you can book again if there is still room.",
}

/** Label for a dead booking, falling back to the plain word for anything else. */
export const deadBookingLabel = (b?: { status?: string } | null): string => {
	const kind = deadBookingKind(b)
	return kind ? DEAD_BOOKING_LABEL[kind] : (b?.status ?? "")
}
