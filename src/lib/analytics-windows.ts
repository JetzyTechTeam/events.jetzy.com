/**
 * Last 24h / 7 / 30 / 60 day reporting windows, shared by every "CEO report" style summary.
 *
 * Extracted from src/pages/api/analytics/ceo-report-summary.ts so the per-event summary on
 * /console/events/[eventId]/analytics computes its columns exactly the same way the emailed
 * report does. Two surfaces quoting the same window with different boundaries is the fastest
 * way to make a host distrust both.
 *
 * Boundary convention (matches apis-service's dailyUsersOverviewReportGenerator buildPeriods):
 * 24h is a ROLLING window ending now; 7/30/60 days are UTC calendar-day aligned. Everything is
 * UTC — the server's local timezone must never decide where a day starts, or the two "Last 24h"
 * columns in one email describe different spans.
 */

export type WindowKey = "24h" | "7days" | "30days" | "60days"

export const WINDOW_KEYS: WindowKey[] = ["24h", "7days", "30days", "60days"]

/** Human labels for the same keys, so every table headers itself identically. */
export const WINDOW_LABELS: Record<WindowKey, string> = {
	"24h": "Last 24h",
	"7days": "7 Days",
	"30days": "30 Days",
	"60days": "60 Days",
}

export interface ReportWindow {
	key: WindowKey
	from: Date
	to: Date
}

export function utcStartOfDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

export function utcEndOfDay(d: Date): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

export function subDays(d: Date, days: number): Date {
	return new Date(d.getTime() - days * 24 * 60 * 60 * 1000)
}

export function buildWindows(now: Date): ReportWindow[] {
	return [
		{ key: "24h", from: subDays(now, 1), to: now },
		{ key: "7days", from: utcStartOfDay(subDays(now, 6)), to: utcEndOfDay(now) },
		{ key: "30days", from: utcStartOfDay(subDays(now, 29)), to: utcEndOfDay(now) },
		{ key: "60days", from: utcStartOfDay(subDays(now, 59)), to: utcEndOfDay(now) },
	]
}

export const emptyByWindow = <T,>(value: T): Record<WindowKey, T> =>
	WINDOW_KEYS.reduce((acc, k) => ({ ...acc, [k]: value }), {} as Record<WindowKey, T>)

/**
 * One `$facet` branch per window, so four columns cost one round trip rather than four.
 * `extraMatch` is spread FIRST so a caller can never accidentally override the date bound.
 */
export async function countByWindow(
	model: any,
	dateField: string,
	windows: ReportWindow[],
	extraMatch: Record<string, any> = {},
): Promise<Record<WindowKey, number>> {
	const facet: Record<string, any[]> = {}
	for (const w of windows) {
		facet[w.key] = [{ $match: { ...extraMatch, [dateField]: { $gte: w.from, $lte: w.to } } }, { $count: "n" }]
	}
	const [result] = await model.aggregate([{ $facet: facet }])
	const out: Record<WindowKey, number> = emptyByWindow(0)
	for (const key of WINDOW_KEYS) out[key] = result?.[key]?.[0]?.n || 0
	return out
}

/** Distinct count of `distinctField` per window — people, not rows. */
export async function distinctCountByWindow(
	model: any,
	dateField: string,
	distinctField: string,
	windows: ReportWindow[],
	extraMatch: Record<string, any> = {},
): Promise<Record<WindowKey, number>> {
	const facet: Record<string, any[]> = {}
	for (const w of windows) {
		facet[w.key] = [
			{ $match: { ...extraMatch, [dateField]: { $gte: w.from, $lte: w.to } } },
			{ $group: { _id: `$${distinctField}` } },
			{ $count: "n" },
		]
	}
	const [result] = await model.aggregate([{ $facet: facet }])
	const out: Record<WindowKey, number> = emptyByWindow(0)
	for (const key of WINDOW_KEYS) out[key] = result?.[key]?.[0]?.n || 0
	return out
}

export async function sumByWindow(
	model: any,
	dateField: string,
	sumField: string,
	windows: ReportWindow[],
	extraMatch: Record<string, any> = {},
): Promise<Record<WindowKey, number>> {
	const facet: Record<string, any[]> = {}
	for (const w of windows) {
		facet[w.key] = [
			{ $match: { ...extraMatch, [dateField]: { $gte: w.from, $lte: w.to } } },
			{ $group: { _id: null, total: { $sum: `$${sumField}` } } },
		]
	}
	const [result] = await model.aggregate([{ $facet: facet }])
	const out: Record<WindowKey, number> = emptyByWindow(0)
	for (const key of WINDOW_KEYS) out[key] = result?.[key]?.[0]?.total || 0
	return out
}
