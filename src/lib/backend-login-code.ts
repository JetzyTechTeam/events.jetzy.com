/**
 * The Jetzy backend's emailed login code (`/v1/accounts/login-code/*`) — the ONE sign-in behind the
 * portal's email-code doors: `/auth/login-otp`, the Premium email code, and the album gate.
 *
 * Since backend 9e10f0fc it serves new and existing addresses alike: `send` emails a code to any
 * address (identical response either way — no enumeration), and a correct `verify` for an address
 * with no account CREATES it through the same `AuthLib.createUser()` as normal signup (referral
 * credit, settings, trial, JetPoints). Either way it returns a real backend `accessToken`, which is
 * what lets the portal read and save the profile the mobile app uses.
 *
 * Our own code store (`album-verification.ts`) is now only the OUTAGE fallback — callers use it when
 * `send` reports `unavailable` (network error or 5xx), never on a 429.
 */

const base = () => (process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com").replace(/\/$/, "")

const TIMEOUT_MS = 8000

export type LoginCodePurpose = "login" | "album" | "premium"
export type LoginCodeSource = "web_login" | "web_album" | "web_premium"

const post = async (path: string, body: Record<string, unknown>) => {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const r = await fetch(`${base()}/api/v1/accounts/login-code/${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify(body),
			signal: controller.signal,
		})
		const json = await r.json().catch(() => ({} as any))
		return { status: r.status, ok: r.ok, json }
	} finally {
		clearTimeout(timer)
	}
}

export type BackendSendResult =
	| { ok: true }
	/** Rate-limited by the backend — tell the person to wait; do NOT fall back to our own code. */
	| { ok: false; rateLimited: true; message?: string }
	/** Backend unreachable or erroring — the caller may fall back to our own code. */
	| { ok: false; unavailable: true; status?: number; message?: string }
	/** Anything else the backend refused (e.g. a malformed address). */
	| { ok: false; status: number; message?: string }

export const sendBackendLoginCode = async (email: string, purpose?: LoginCodePurpose): Promise<BackendSendResult> => {
	try {
		const r = await post("send", {
			email: email.trim().toLowerCase(),
			platform: "web",
			...(purpose ? { purpose } : {}),
		})
		if (r.ok) return { ok: true }
		if (r.status === 429) return { ok: false, rateLimited: true, message: r.json?.message }
		if (r.status >= 500) return { ok: false, unavailable: true, status: r.status, message: r.json?.message }
		return { ok: false, status: r.status, message: r.json?.message }
	} catch {
		return { ok: false, unavailable: true }
	}
}

export type BackendVerifyResult =
	| {
			ok: true
			accessToken: string
			isNewUser: boolean
			userId?: string
			firstName?: string
			lastName?: string
	  }
	| { ok: false; status: number; message?: string }

export const verifyBackendLoginCode = async (
	email: string,
	code: string,
	opts: { firstName?: string; lastName?: string; refCode?: string; source?: LoginCodeSource } = {},
): Promise<BackendVerifyResult> => {
	try {
		const r = await post("verify", {
			email: email.trim().toLowerCase(),
			code: code.trim(),
			// Only used by the backend when it CREATES the account; ignored for an existing one.
			...(opts.firstName ? { firstName: opts.firstName } : {}),
			...(opts.lastName ? { lastName: opts.lastName } : {}),
			...(opts.refCode ? { refCode: opts.refCode } : {}),
			...(opts.source ? { source: opts.source } : {}),
		})
		const data = r.json?.data
		if (r.ok && data?.accessToken) {
			const u = data.user || {}
			return {
				ok: true,
				accessToken: data.accessToken,
				isNewUser: data.isNewUser === true,
				userId: u._id ? String(u._id) : undefined,
				firstName: u.firstName,
				lastName: u.lastName,
			}
		}
		return { ok: false, status: r.status, message: r.json?.message }
	} catch {
		return { ok: false, status: 503, message: "We couldn't check that code right now. Please try again." }
	}
}

/** One message per failure, shared by every door. */
export const verifyFailureMessage = (status: number, message?: string) =>
	status === 423 || status === 429
		? "Too many attempts. Please try again later."
		: message || "That code didn't work. Check it and try again."
