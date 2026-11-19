import { Types } from "mongoose"

/**
 * Who created each event on a PAGE of events, in two queries — SERVER ONLY.
 *
 * Used by the console events list so an admin can see whose event each row is. Batched rather
 * than calling `resolveEventOwner` per row: that is two `findById`s per event, forty round trips
 * for one page.
 *
 * `ownerId` may point at EITHER collection — `Users` (mobile app / checkout accounts) or
 * `EventUsers` (this portal's signup) — the same dual lookup `findUserRecord` does. `Users` wins
 * when both somehow hold the id, matching `findUserRecord`'s order.
 *
 * Returns `null` when the lookup failed, which callers must treat differently from "no creator":
 * the events come back untouched and the card shows nothing, rather than calling every event's
 * creator unknown because the database blinked.
 */

export type EventCreator = {
	/** "Anna Khan", falling back to the local part of the address when no name is stored. */
	name: string
	email?: string
}

const displayName = (doc: any): string => {
	const full = [doc?.firstName, doc?.lastName]
		.filter((s: unknown) => typeof s === "string" && s.trim())
		.map((s: string) => s.trim())
		.join(" ")
	return full || (typeof doc?.email === "string" ? doc.email.split("@")[0] : "") || "Unnamed user"
}

export async function getEventCreators(ownerIds: unknown[]): Promise<Map<string, EventCreator> | null> {
	try {
		const ids = Array.from(new Set(ownerIds.filter(Boolean).map((id) => String(id))))
			.filter((id) => Types.ObjectId.isValid(id))
			.map((id) => new Types.ObjectId(id))

		const creators = new Map<string, EventCreator>()
		if (!ids.length) return creators

		const { ensureDbConnected } = await import("@/configs/database")
		await ensureDbConnected()
		const { Users } = await import("@/models/userModal")
		const { EventUsers } = await import("@/models/eventUsersModal")

		const fields = "firstName lastName email"
		const [eventUsers, users] = await Promise.all([
			EventUsers.find({ _id: { $in: ids } }).select(fields).lean(),
			Users.find({ _id: { $in: ids } }).select(fields).lean(),
		])
		// EventUsers first so a `Users` doc with the same id overwrites it — findUserRecord's order.
		for (const doc of [...(eventUsers as any[]), ...(users as any[])]) {
			creators.set(String(doc._id), { name: displayName(doc), ...(doc.email ? { email: doc.email } : {}) })
		}
		return creators
	} catch (error: any) {
		// A listing must never fail because its creator names did.
		console.error("[event-creators] Failed to resolve creators:", error?.message || error)
		return null
	}
}

/**
 * Stamps `creator` onto each event. Call it only for an admin — like `totalViews`, the field's
 * presence in the payload is the gate, so a host's list must never pass through here.
 *
 * `creator: null` = looked up and there is nobody to name: no `ownerId` (events created before
 * ownership existed) or an owner account that no longer exists. Lookup failure leaves the events
 * untouched, with no field at all.
 */
export async function attachEventCreators<T extends { ownerId?: any }>(
	events: T[],
): Promise<(T & { creator?: EventCreator | null })[]> {
	const creators = await getEventCreators(events.map((event) => event?.ownerId))
	if (!creators) return events
	return events.map((event) => ({
		...event,
		creator: (event?.ownerId && creators.get(String(event.ownerId))) || null,
	}))
}
