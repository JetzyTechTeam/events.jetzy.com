// Canonical event ordering + status classification.
// Single source of truth used by the public API, the public listing (client),
// and the My Events console page so they never drift.

import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

export type EventStatus = "live" | "future" | "tbd" | "past"

const toTime = (v: any): number | null => {
	if (v == null || v === "") return null
	const t = new Date(v).getTime()
	return Number.isNaN(t) ? null : t
}

// Stored timezone format is "(UTC+05:00) Asia/Karachi" — pull out the IANA zone.
// (Same parse create.ts uses.)
const parseTz = (tz?: string): string | undefined => {
	if (!tz) return undefined
	return tz.split(") ")[1] || tz
}

// End of the calendar day that `value` falls on, in the event's timezone.
// Date-only events store their date at midnight, so they must stay live through
// the whole day rather than expiring the instant midnight passes.
const endOfDay = (value: any, tz?: string): number => {
	const zone = parseTz(tz)
	const d = zone ? dayjs(value).tz(zone) : dayjs(value)
	return d.endOf("day").valueOf()
}

/**
 * When is this event over? (single source of truth for past/live)
 *   - endsOn present:  hasEndTime === false -> end of the endsOn day (tz); else exact endsOn instant
 *   - else startsOn present (no end): end of the startsOn day (tz) — live through that day
 *   - else null (TBD)
 */
export function getEffectiveEnd(e: any): number | null {
	const end = toTime(e?.endsOn)
	if (end != null) {
		return e?.hasEndTime === false ? endOfDay(e.endsOn, e?.timezone) : end
	}
	const start = toTime(e?.startsOn)
	if (start != null) {
		return endOfDay(e.startsOn, e?.timezone)
	}
	return null
}

/**
 * Classify an event.
 *   - no startsOn AND no endsOn         -> "tbd"
 *   - effectiveEnd < now                -> "past"
 *   - startsOn exists && startsOn > now  -> "future"
 *   - otherwise                         -> "live"
 * "live" also covers a date-only event (live all day) and an end-only
 * ("by mistake") event — live until its end day passes.
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
