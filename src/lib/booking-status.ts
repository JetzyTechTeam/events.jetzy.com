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
