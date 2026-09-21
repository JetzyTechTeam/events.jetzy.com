/**
 * The Jetzy backend's own emailed login code (`/v1/accounts/login-code/*`) — the same calls
 * `/auth/login-otp` makes. Verifying through it returns a REAL backend `accessToken`, which our
 * own emailed code can't: our code proves the address but leaves NextAuth trying a fixed password
 * against the backend, which fails for anyone who already has a Jetzy account. Without a token the
 * portal can't read or save their profile on the account the mobile app uses.
 *
 * SERVER ONLY — it reads the `users` collection.
 */
import { Users } from "@Jetzy/models/userModal"

const base = () => (process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com").replace(/\/$/, "")

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Whether the address already has a Jetzy account. `users` is the backend's own collection, so a
 * row there is an account its login-code endpoint can serve. Case-insensitive: `users.email` has
 * no `lowercase: true`.
 */
export const hasJetzyAccount = async (email: string): Promise<boolean> => {
	const found = await Users.findOne({ email: { $regex: `^${escapeRegex(email.trim())}$`, $options: "i" } })
		.select("_id")
		.lean()
	return !!found
}

export type BackendSendResult = { ok: true } | { ok: false; status: number; message?: string }

export const sendBackendLoginCode = async (email: string): Promise<BackendSendResult> => {
	const r = await fetch(`${base()}/api/v1/accounts/login-code/send`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: email.trim().toLowerCase(), platform: "web" }),
	})
	if (r.ok) return { ok: true }
	const body = await r.json().catch(() => ({} as any))
	return { ok: false, status: r.status, message: body?.message }
}

export type BackendVerifyResult =
	| { ok: true; accessToken: string; firstName?: string; lastName?: string }
	| { ok: false; status: number; message?: string }

export const verifyBackendLoginCode = async (email: string, code: string): Promise<BackendVerifyResult> => {
	const r = await fetch(`${base()}/api/v1/accounts/login-code/verify`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
	})
	const body = await r.json().catch(() => ({} as any))
	if (r.ok && body?.data?.accessToken) {
		const u = body.data.user || {}
		return { ok: true, accessToken: body.data.accessToken, firstName: u.firstName, lastName: u.lastName }
	}
	return { ok: false, status: r.status, message: body?.message }
}
