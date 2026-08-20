import type { NextApiRequest } from "next"

/**
 * Per-instance, in-memory rate limiting.
 *
 * Serverless means this resets on cold start and isn't shared across instances, so it is a
 * speed bump against casual abuse rather than a hard guarantee. Lifted out of
 * api/premium/check-email.ts, which had its own private copy, so new endpoints don't each
 * grow another one.
 */

const buckets = new Map<string, { count: number; resetAt: number }>()

/**
 * Returns true when `key` has exceeded `max` hits inside `windowMs`.
 *
 * Callers should namespace their key (e.g. `album-code:${ip}`) so two endpoints sharing an
 * instance don't consume each other's allowance.
 */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
	const now = Date.now()
	const bucket = buckets.get(key)

	if (!bucket || now > bucket.resetAt) {
		buckets.set(key, { count: 1, resetAt: now + windowMs })
		// Opportunistic sweep so the map can't grow without bound on a long-lived instance.
		if (buckets.size > 5000) {
			for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
		}
		return false
	}

	bucket.count += 1
	return bucket.count > max
}

/** Best-effort client identity for rate limiting: the proxy-forwarded IP, else the socket. */
export function clientKey(req: NextApiRequest): string {
	const forwarded = req.headers["x-forwarded-for"]
	const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
	return (raw?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown").toLowerCase()
}
