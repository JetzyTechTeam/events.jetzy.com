/**
 * Ticket checkout is email-verified (CEO, 2026-11-18): a booking is accepted only from a session
 * signed in AS the checkout email — proving the address is what creates the buyer's Jetzy account
 * and signs them in (`api/checkout/send-code` + `verify-code`).
 *
 * The ONE rule, shared by both checkout endpoints and the checkout modal so the step the buyer is
 * shown and the check the server enforces cannot disagree. Pure and client-safe.
 *
 * Admins and super admins are exempt by decision: they book on a guest's behalf, at the door or
 * for a VIP, and must not be signed in as that guest to do it.
 */

export const CHECKOUT_VERIFY_MESSAGE = "Please confirm your email to book this ticket."

const normaliseEmail = (email?: string | null) => String(email || "").trim().toLowerCase()

export const isAdminSessionRole = (role?: string | null) => role === "admin" || role === "super admin"

/** True when this session may place a booking under `checkoutEmail` without a code. */
export const sessionMayBookAs = (
	sessionUser: { email?: string | null; role?: string | null } | null | undefined,
	checkoutEmail?: string | null,
): boolean => {
	if (!sessionUser) return false
	if (isAdminSessionRole(sessionUser.role)) return true
	const sessionEmail = normaliseEmail(sessionUser.email)
	return !!sessionEmail && sessionEmail === normaliseEmail(checkoutEmail)
}
