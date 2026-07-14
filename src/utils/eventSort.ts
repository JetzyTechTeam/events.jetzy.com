// Canonical event ordering + status classification.
// Single source of truth used by the public API, the public listing (client),
// and the My Events console page so they never drift.

import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { getEventZone } from "./eventTime"

dayjs.extend(utc)
dayjs.extend(timezone)

export type EventStatus = "live" | "future" | "tbd" | "past"

const toTime = (v: any): number | null => {
	if (v == null || v === "") return null
	const t = new Date(v).getTime()
	return Number.isNaN(t) ? null : t
}

// End of the calendar day that `value` falls on, in the event's timezone.
// Date-only events store their date at midnight, so they must stay live through
// the whole day rather than expiring the instant midnight passes.
// getEventZone maps legacy abbreviations ("EDT" -> America/New_York) and falls
// back to UTC for anything Intl/dayjs rejects, so this can never throw on bad
// timezone data (which would 500 the whole listing).
const endOfDay = (value: any, tz?: string): number => {
	const zone = tz ? getEventZone(tz) : undefined
	const d = zone ? dayjs(value).tz(zone) : dayjs(value)
	return d.endOf("day").valueOf()
}

/**
 * When is this event over? (single source of truth for past/live)
 * Status is driven by the START date (per CEO): an event is over once its
 * start day has passed — the end date does NOT keep it alive.
 *   - startsOn present -> end of the startsOn day (tz); ENDED the next day (endsOn ignored)
 *   - else endsOn present (end-only "by mistake", no start):
 *       hasEndTime === false -> end of the endsOn day (tz); else exact endsOn instant
 *   - else null (TBD)
 */
export function getEffectiveEnd(e: any): number | null {
	const start = toTime(e?.startsOn)
	if (start != null) {
		return endOfDay(e.startsOn, e?.timezone)
	}
	const end = toTime(e?.endsOn)
	if (end != null) {
		return e?.hasEndTime === false ? endOfDay(e.endsOn, e?.timezone) : end
	}
	return null
}

/**
 * Classify an event by its START date (in the event's timezone):
 *   - no startsOn AND no endsOn         -> "tbd"
 *   - start day is before today         -> "past"  (ENDED once start date passes)
 *   - startsOn is in the future         -> "future" (UPCOMING)
 *   - start day is today                -> "live"
 * The end date is ignored for status — a multi-day event still ends the day
 * after it starts.
 */
export function getEventStatus(e: any, now: number = Date.now()): EventStatus {
	const start = toTime(e?.startsOn)
	const end = toTime(e?.endsOn)

	if (start == null && end == null) return "tbd"

	const effectiveEnd = getEffectiveEnd(e) as number
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

const effectiveEndTime = (e: any): number => getEffectiveEnd(e) ?? 0
const startTime = (e: any): number => toTime(e?.startsOn) ?? 0
const createdTime = (e: any): number => toTime(e?.createdAt) ?? 0

/**
 * Sort into the canonical order: live -> future -> tbd -> past.
 * Within each bucket:
 *   live   -> effectiveEnd ASC (ending soonest first)
 *   future -> startsOn ASC (soonest first)
 *   tbd    -> createdAt DESC (newest first)
 *   past   -> start day DESC (most recently ended first)
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
				return effectiveEndTime(b) - effectiveEndTime(a)
		}
	})
}
