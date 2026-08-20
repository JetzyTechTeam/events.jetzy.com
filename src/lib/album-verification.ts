import crypto from "crypto"
import { Types } from "mongoose"
import { AlbumVerification } from "@/models/events/album-verification"

/** A code is good for 10 minutes. Long enough to find the email, short enough to matter. */
export const CODE_TTL_MS = 10 * 60 * 1000
/** Wrong guesses allowed before the code is dead. 6 digits / 5 tries is not brute-forceable. */
export const MAX_ATTEMPTS = 5
/** How long before another code can be sent to the same address. */
export const RESEND_COOLDOWN_MS = 60 * 1000

export type ConsumeResult = { ok: true } | { ok: false; reason: "invalid" | "expired" | "locked" }

/** Cryptographically random 6-digit code — `Math.random()` is not suitable for a secret. */
function generateCode(): string {
	return crypto.randomInt(100000, 1000000).toString()
}

/**
 * Issues (or re-issues) the pending code for one (event, email).
 *
 * Returns `null` while the resend cooldown is still running so the caller can answer 429
 * without sending a second email. One row per pair, overwritten — an older code stops
 * working the moment a new one is sent.
 */
export async function issueAlbumCode(eventId: string, email: string): Promise<{ code: string } | null> {
	const now = Date.now()
	const filter = { eventId: new Types.ObjectId(eventId), email }

	const existing = await AlbumVerification.findOne(filter).sort({ createdAt: -1 }).lean()
	if (existing?.lastSentAt && now - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS) {
		return null
	}

	const code = generateCode()
	await AlbumVerification.updateOne(
		filter,
		{
			$set: {
				code,
				expiresAt: new Date(now + CODE_TTL_MS),
				attempts: 0,
				lastSentAt: new Date(now),
			},
		},
		{ upsert: true },
	)

	return { code }
}

/**
 * Checks a submitted code and spends it.
 *
 * A correct code is deleted, so it works exactly once. A wrong one burns an attempt, which
 * is what stops someone walking the 6-digit space inside the TTL.
 */
export async function consumeAlbumCode(eventId: string, email: string, code: string): Promise<ConsumeResult> {
	const filter = { eventId: new Types.ObjectId(eventId), email }
	const row = await AlbumVerification.findOne(filter).sort({ createdAt: -1 })

	if (!row) return { ok: false, reason: "expired" }
	if ((row.attempts ?? 0) >= MAX_ATTEMPTS) return { ok: false, reason: "locked" }
	if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, reason: "expired" }

	if (row.code !== code) {
		await AlbumVerification.updateOne({ _id: row._id }, { $inc: { attempts: 1 } })
		// Report the lock on the attempt that reaches the cap, not one request later.
		return { ok: false, reason: (row.attempts ?? 0) + 1 >= MAX_ATTEMPTS ? "locked" : "invalid" }
	}

	await AlbumVerification.deleteOne({ _id: row._id })
	return { ok: true }
}

/** Message for a failed check. Never states whether the address has an account. */
export function consumeFailureMessage(reason: "invalid" | "expired" | "locked"): string {
	if (reason === "locked") return "Too many incorrect attempts. Request a new code."
	if (reason === "expired") return "That code has expired. Request a new one."
	return "That code is incorrect."
}
