// Canonical event ordering + status classification.
// Single source of truth used by the public API, the public listing (client),
// and the My Events console page so they never drift.

export type EventStatus = "live" | "future" | "tbd" | "past"

const toTime = (v: any): number | null => {
	if (v == null || v === "") return null
	const t = new Date(v).getTime()
	return Number.isNaN(t) ? null : t
}

/**
 * Classify an event.
 *   effectiveEnd = endsOn ?? startsOn (latest known date)
 *   - no startsOn AND no endsOn        -> "tbd"
 *   - effectiveEnd < now               -> "past"
 *   - startsOn exists && startsOn > now -> "future"
 *   - otherwise                        -> "live"
 * "live" also covers an end-only ("by mistake") event — live until endsOn passes.
 */
export function getEventStatus(e: any, now: number = Date.now()): EventStatus {
	const start = toTime(e?.startsOn)
	const end = toTime(e?.endsOn)

	if (start == null && end == null) return "tbd"

	const effectiveEnd = (end ?? start) as number
	if (effectiveEnd < now) return "past"

	if (start != null && start > now) return "future"

	return "live"
}

export const STATUS_RANK: Record<EventStatus, number> = {
	live: 0,
	future: 1,
	tbd: 2,
	past: 3,
}

export const getStatusRank = (e: any, now?: number): number => STATUS_RANK[getEventStatus(e, now)]

export const STATUS_LABEL: Record<EventStatus, string> = {
	live: "LIVE",
	future: "UPCOMING",
	tbd: "TBD",
	past: "ENDED",
}

const effectiveEndTime = (e: any): number => toTime(e?.endsOn) ?? toTime(e?.startsOn) ?? 0
const startTime = (e: any): number => toTime(e?.startsOn) ?? 0
const endTime = (e: any): number => toTime(e?.endsOn) ?? 0
const createdTime = (e: any): number => toTime(e?.createdAt) ?? 0

/**
 * Sort into the canonical order: live -> future -> tbd -> past.
 * Within each bucket:
 *   live   -> effectiveEnd ASC (ending soonest first)
 *   future -> startsOn ASC (soonest first)
 *   tbd    -> createdAt DESC (newest first)
 *   past   -> endsOn DESC (most recently ended first)
 */
export function sortEvents<T = any>(events: T[], now: number = Date.now()): T[] {
	return [...events].sort((a: any, b: any) => {
		const sa = getEventStatus(a, now)
		const sb = getEventStatus(b, now)
		if (STATUS_RANK[sa] !== STATUS_RANK[sb]) return STATUS_RANK[sa] - STATUS_RANK[sb]

		switch (sa) {
			case "live":
				return effectiveEndTime(a) - effectiveEndTime(b)
			case "future":
				return startTime(a) - startTime(b)
			case "tbd":
				return createdTime(b) - createdTime(a)
			case "past":
				return endTime(b) - endTime(a)
		}
	})
}
