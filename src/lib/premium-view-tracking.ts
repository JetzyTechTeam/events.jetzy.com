/**
 * Fire-and-forget client helper for the `/premium` + `/subscribe` open-vs-bought funnel.
 *
 * See `src/models/events/premium-page-view.ts` for why this exists and how the rows are keyed.
 * Kept as its own tiny module (not inline in the pages) so both pages call the exact same
 * dedupe + transport logic and can't drift.
 */

/**
 * Where the visit happened. `"modal"` is the "Buy Jetzy Premium" dialog, which is opened from
 * the navbar on any page — it is not a URL, but it is a door onto the same purchase and was the
 * only one with no funnel row at all, so every click on that button was invisible.
 */
export type PremiumViewPage = "premium" | "subscribe" | "modal"
export type PremiumViewStage = "landed" | "checkout_started"

type TrackParams = {
	anonId?: string | null
	sessionId?: string | null
	page: PremiumViewPage
	stage: PremiumViewStage
	/** Invite/referral code active on this visit, if any. */
	code?: string
	/** Only meaningful alongside `code` — a host's referral share link. */
	eventId?: string
}

/**
 * Once per (page, code, stage) per tab — React effects re-run, and a funnel that double-counts
 * one of its own steps is worse than no funnel.
 */
const dedupeKey = (page: string, code: string, stage: string) => `premium_view_${page}_${code || "none"}_${stage}`

export function trackPremiumView(params: TrackParams) {
	if (typeof window === "undefined") return
	if (!params.anonId) return

	const code = (params.code || "").trim()
	const key = dedupeKey(params.page, code, params.stage)
	try {
		if (sessionStorage.getItem(key)) return
		sessionStorage.setItem(key, "1")
	} catch {
		/* sessionStorage unavailable — worst case this stage is recorded twice */
	}

	const payload = {
		anonId: params.anonId,
		sessionId: params.sessionId || undefined,
		page: params.page,
		stage: params.stage,
		code: code || undefined,
		eventId: params.eventId || undefined,
	}

	try {
		// `checkout_started` fires immediately before `window.location.href` leaves the page —
		// an ordinary fetch can be aborted mid-flight by the navigation, so this uses the same
		// sendBeacon technique the session-end dwell flush does (see AnalyticsContext).
		if (params.stage === "checkout_started" && typeof navigator !== "undefined" && navigator.sendBeacon) {
			const blob = new Blob([JSON.stringify(payload)], { type: "application/json" })
			navigator.sendBeacon("/api/analytics/premium-view", blob)
			return
		}
	} catch {
		/* fall through to fetch */
	}

	fetch("/api/analytics/premium-view", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
		keepalive: true,
	}).catch(() => {
		/* instrumentation must never surface to the visitor */
	})
}
