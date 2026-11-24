/**
 * The checkout email-check steps, as `EventInteraction.interactionType` values. Pure and
 * client-safe — the checkout modal writes them, the reports read them through
 * `checkout-verification-stats.ts`.
 *
 * Booking a ticket requires a session signed in AS the checkout email (CEO, 2026-11-18), so a
 * buyer either proves the address with a 6-digit code or skips the step because they are already
 * signed in as it (or are an admin booking for a guest). Until 2026-11-24 none of this was
 * recorded: "opened checkout → submitted" hid everyone who got a code and gave up.
 */
export const VERIFY_CODE_SENT = "verify_code_sent" // a code was emailed (a resend writes another row)
export const VERIFY_CODE_FAILED = "verify_code_failed" // a code was typed and refused (one row per attempt)
export const EMAIL_VERIFIED = "email_verified" // the code worked and the buyer was signed in
export const VERIFY_SKIPPED = "verify_skipped" // no code needed — already signed in as that email, or an admin

export const CHECKOUT_VERIFICATION_TYPES = [VERIFY_CODE_SENT, VERIFY_CODE_FAILED, EMAIL_VERIFIED, VERIFY_SKIPPED] as const

/** Every count is distinct SESSIONS except `wrongCodeAttempts` and `resends`, which are attempts. */
export type CheckoutVerificationStats = {
	/** Got a code emailed to them. */
	codeSent: number
	/** Typed the code and got through. */
	verified: number
	/** Got a code and never got through — the drop-off this was built to show. */
	neverVerified: number
	/** Needed no code: already signed in as that email, or an admin booking for a guest. */
	alreadySignedIn: number
	/** Verified OR already signed in — everyone who passed the email check. */
	confirmed: number
	/** Wrong codes typed, all attempts. */
	wrongCodeAttempts: number
	/** Extra codes requested after the first. */
	resends: number
}

export const emptyCheckoutVerificationStats = (): CheckoutVerificationStats => ({
	codeSent: 0,
	verified: 0,
	neverVerified: 0,
	alreadySignedIn: 0,
	confirmed: 0,
	wrongCodeAttempts: 0,
	resends: 0,
})

export const hasCheckoutVerificationData = (s: CheckoutVerificationStats | null | undefined) =>
	!!s && (s.codeSent > 0 || s.alreadySignedIn > 0 || s.wrongCodeAttempts > 0)
