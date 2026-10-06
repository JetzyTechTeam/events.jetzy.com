/**
 * Definitions shared by the admin analytics endpoints, so the same word means the same number
 * on every tab.
 *
 * Revenue — `booking.total` is what the guest owed AFTER discounts (see booking-revenue.ts).
 * The dashboard used to subtract `discountAmount` from it a second time, which is how "Net
 * revenue" came out negative. Gross is `subTotal` (list price), net is `total`.
 *
 * Visitors — a `UserSession` row is one session, so counting rows counts sessions, not people.
 * A visitor is the logged-in user when there is one, else the browser's persistent `anonId`,
 * else (legacy rows with neither) the session itself.
 *
 * Session duration — the session-end beacon measures from `startTime`, and sessionStorage
 * survives reloads, so a tab left open for a day reports a day-long session. Those few rows
 * dragged the average to "3h". Sessions longer than MAX_SESSION_SECONDS are left out of the
 * average and reported separately.
 */

export const MAX_SESSION_SECONDS = 4 * 60 * 60

/** Visitor identity for a UserSession row. */
export const sessionVisitorKey = {
	$ifNull: [{ $toString: "$userId" }, { $ifNull: ["$anonId", "$sessionId"] }],
}

/** Visitor identity for an EventInteraction row (the event page stamps `metadata.visitorId`). */
export const interactionVisitorKey = {
	$ifNull: [{ $toString: "$userId" }, { $ifNull: ["$metadata.visitorId", "$sessionId"] }],
}

/** Parse the dashboard's dateFrom/dateTo query params into a Mongo range filter (or null). */
export const parseDateRange = (query: { dateFrom?: unknown; dateTo?: unknown }) => {
	const filter: { $gte?: Date; $lte?: Date } = {}
	if (typeof query.dateFrom === "string" && query.dateFrom) {
		const from = new Date(query.dateFrom)
		from.setHours(0, 0, 0, 0)
		if (!isNaN(from.getTime())) filter.$gte = from
	}
	if (typeof query.dateTo === "string" && query.dateTo) {
		const to = new Date(query.dateTo)
		to.setHours(23, 59, 59, 999)
		if (!isNaN(to.getTime())) filter.$lte = to
	}
	return Object.keys(filter).length > 0 ? filter : null
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0)
