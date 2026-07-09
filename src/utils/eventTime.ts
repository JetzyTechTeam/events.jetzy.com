// Consistent event date/time display — always in the EVENT's own timezone.
// Every surface (cards, detail, manage) must use these so an event reads the
// same time everywhere, regardless of the viewer's browser timezone.
//
// Uses moment-timezone throughout: the timezone picker's option list comes from
// moment.tz.names(), and dayjs/Intl throws on some names moment allows
// (e.g. America/Coyhaique). Formatting with the same library avoids that gap.

import moment from "moment-timezone"

/**
 * Resolve the IANA zone from a stored `timezone` value.
 * Handles both stored forms:
 *   "(UTC+00:00) Africa/Abidjan" -> "Africa/Abidjan"
 *   "Africa/Abidjan"             -> "Africa/Abidjan"
 * Empty/undefined -> the viewer's guessed zone (last resort only).
 */
export function getEventZone(tz?: string): string {
	if (!tz) return moment.tz.guess()
	const parts = tz.split(") ")
	return parts.length > 1 ? parts[1] : tz
}

/**
 * Build the canonical timezone option label for an IANA zone, e.g.
 * "Africa/Abidjan" -> "(UTC+00:00) Africa/Abidjan". This is the exact string
 * stored on the event and used as the <select> option value, so display,
 * normalization, and the picker all agree.
 */
export function buildTimezoneValue(tz: string): string {
	const off = moment.tz(tz).utcOffset() // minutes
	const sign = off >= 0 ? "+" : "-"
	const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0")
	const mm = String(Math.abs(off) % 60).padStart(2, "0")
	return `(UTC${sign}${hh}:${mm}) ${tz}`
}

/**
 * Canonicalize any stored timezone to the option-label form, preserving the
 * real zone. Handles bare ("Africa/Abidjan"), prefixed, and "UTC".
 * "UTC" -> "(UTC+00:00) UTC"; empty -> "".
 */
export function normalizeTimezone(stored?: string): string {
	if (!stored) return ""
	return buildTimezoneValue(getEventZone(stored))
}

/** The full selected timezone label to display next to times. */
export function formatEventZoneLabel(tz?: string): string {
	return normalizeTimezone(tz)
}

/** Format a stored UTC instant as a time (e.g. "05:00 AM") in the event zone. */
export function formatEventTime(value: any, tz?: string): string {
	if (!value) return ""
	return moment.utc(value).tz(getEventZone(tz)).format("hh:mm A")
}

/** Format a stored UTC instant as a date (e.g. "July 09, 2026") in the event zone. */
export function formatEventDate(value: any, tz?: string): string {
	if (!value) return ""
	return moment.utc(value).tz(getEventZone(tz)).format("MMMM DD, YYYY")
}

/** Weekday / day-number / month-year parts (uppercased) for the My Events DateBlock. */
export function formatEventDateParts(value: any, tz?: string): { weekday: string; day: string; monthYear: string } {
	const d = moment.utc(value).tz(getEventZone(tz))
	return {
		weekday: d.format("dddd").toUpperCase(),
		day: d.format("D"),
		monthYear: d.format("MMMM YYYY").toUpperCase(),
	}
}
