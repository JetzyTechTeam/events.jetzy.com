import { Types } from "mongoose"

/**
 * All-time view counts for a PAGE of events, in one query.
 *
 * Server only — it loads the analytics models. Used by the event lists to put a view count on
 * each card for an admin, without a request per card.
 *
 * The number is the same one Manage Event shows as "Views" and the analytics page as "Page
 * Views": every `view` interaction recorded for the event (`api/analytics/events.ts` →
 * `summary.views`). Visits, repeats included — not unique people. Counting it any other way
 * here would let a card and the manage page disagree about the same event.
 *
 * Returns `null` when the count could not be read. That is NOT the same as zero, and callers
 * must not render it as one: an event with real traffic showing "0 views" because analytics
 * was briefly unreachable is a false statement, while showing nothing is merely incomplete.
 */
export async function getEventViewCounts(eventIds: unknown[]): Promise<Map<string, number> | null> {
	try {
		const ids = eventIds
			.map((id) => String(id))
			.filter((id) => Types.ObjectId.isValid(id))
			.map((id) => new Types.ObjectId(id))

		const counts = new Map<string, number>()
		if (!ids.length) return counts

		const { ensureDbConnected } = await import("@/configs/database")
		await ensureDbConnected()
		const { EventInteraction } = await import("@/models/analytics")

		const rows = await EventInteraction.aggregate([
			{ $match: { eventId: { $in: ids }, interactionType: "view" } },
			{ $group: { _id: "$eventId", views: { $sum: 1 } } },
		])
		rows.forEach((row: any) => counts.set(String(row._id), row.views || 0))
		return counts
	} catch (error: any) {
		// A listing must never fail because its view counts did.
		console.error("[event-view-counts] Failed to count views:", error?.message || error)
		return null
	}
}

/**
 * Stamps `totalViews` onto each event. Call it only for an admin — the field's presence in a
 * response is the gate, so a non-admin's payload must never pass through here.
 *
 * An event nobody has opened gets 0. If the count failed the events come back UNTOUCHED, with
 * no field at all, so the cards render nothing rather than a zero that isn't true.
 */
export async function attachEventViewCounts<T extends { _id?: any }>(events: T[]): Promise<(T & { totalViews?: number })[]> {
	const counts = await getEventViewCounts(events.map((event) => event?._id))
	if (!counts) return events
	return events.map((event) => ({ ...event, totalViews: counts.get(String(event?._id)) ?? 0 }))
}
