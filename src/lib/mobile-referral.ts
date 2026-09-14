/**
 * A Jetzy MOBILE referral code (a member's personal invite code from the app) typed into the
 * Jetzy Premium card — `/subscribe`, `/premium`, the paywall modal.
 *
 * Validated against the Jetzy backend's `/v1/referral/verify/{code}`, the same endpoint the signup
 * forms use. It grants NOTHING extra (product decision, 2026-09-14): a first-time member already
 * gets the standing free month with no code, so a valid referral code keeps exactly that. What it
 * does do:
 *   - counts as a code for the application gate, the way an invite code does;
 *   - is recorded on the sale (`membership_purchases.mobileReferralCode`, source
 *     `mobile_referral`) so the growth report can say which codes brought members in.
 *
 * Checked ONLY after `resolveTrialCode` has said "unknown" and only when no host referral link
 * (`event`) is in play — `jetzy-me` / `1m-off` and shared event links behave exactly as before.
 *
 * Pure `fetch`, isomorphic: the signed-out card calls it from the browser (the signup forms already
 * call this backend from there), the invite-code and checkout routes call it on the server.
 */

export type MobileReferralCheck = "valid" | "invalid" | "unavailable"

export const MOBILE_REFERRAL_ACCEPTED = "Referral code applied."
export const MOBILE_REFERRAL_UNAVAILABLE = "We couldn't check that referral code right now — continuing without it."
export const MOBILE_REFERRAL_UNAVAILABLE_CHECKOUT = "We couldn't check that referral code right now. Try again, or remove the code to continue."

/** Referral codes are sent to the backend as typed, minus surrounding whitespace. */
export const normalizeMobileReferralCode = (code?: string | null): string => (code || "").trim()

/**
 * Is this a real mobile referral code?
 *
 * Three answers, not a boolean. `VerifyReferralCodeApi` returns false on ANY error, so a backend
 * outage reads as "invalid code" — tolerable on a signup form, but here a buyer mid-purchase would
 * be told their friend's real code is wrong. `unavailable` lets the card say what actually happened.
 *
 * The backend answers a bad code with HTTP 400 `{ status: false, message: "Invalid referral code" }`
 * (verified against test, 2026-09-14), so any 4xx is `invalid`; 5xx, timeouts and network failures
 * are `unavailable`.
 */
export async function checkMobileReferralCode(rawCode?: string | null, timeoutMs = 6000): Promise<MobileReferralCheck> {
	const code = normalizeMobileReferralCode(rawCode)
	if (!code) return "invalid"

	const base = (process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com").replace(/\/$/, "")
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)

	try {
		const res = await fetch(`${base}/api/v1/referral/verify/${encodeURIComponent(code)}`, {
			method: "GET",
			signal: controller.signal,
		})
		if (res.status >= 400 && res.status < 500) return "invalid"
		if (!res.ok) return "unavailable"
		// A 2xx that still says `status: false` is a refusal, not a pass.
		const body = await res.json().catch(() => null)
		return body && body.status === false ? "invalid" : "valid"
	} catch {
		return "unavailable"
	} finally {
		clearTimeout(timer)
	}
}
