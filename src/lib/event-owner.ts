/**
 * Who owns an event — SERVER ONLY, and the single definition of it.
 *
 * The same lookup had grown three times over (`booking-notify.ts`, `bookings/cancel.ts`, and
 * again for blasts), which is how one of them ends up subtly different from the others. It goes
 * through `findUserRecord`, which searches **both** `Users` and `EventUsers`: `ownerId` may
 * point at either collection, and `Users.findById` alone silently misses every owner who signed
 * up through this portal.
 *
 * Returns `null` — never throws — when there is no owner, the record can't be found, or the
 * lookup fails. Every caller treats that as "fall back to Jetzy's own identity", because losing
 * a notification or failing a blast over an owner lookup is worse than sending it as Jetzy.
 */

type OwnedEvent = { ownerId?: any } | null | undefined

export type EventOwner = {
	email: string
	firstName?: string
	lastName?: string
	/** "Anna Khan", falling back to the local part of the address when no name is stored. */
	displayName: string
	/** True for admin / super admin — a Jetzy-run event, not a host's. */
	isAdmin: boolean
}

export async function resolveEventOwner(event: OwnedEvent): Promise<EventOwner | null> {
	try {
		if (!event?.ownerId) return null

		const { findUserRecord } = await import("@/lib/premium")
		const { isAdminRole } = await import("@/lib/default-referral-codes")

		const record = await findUserRecord(String(event.ownerId))
		const doc = record?.doc
		if (!doc?.email) return null

		const firstName = (doc.firstName || "").trim() || undefined
		const lastName = (doc.lastName || "").trim() || undefined
		const fullName = [firstName, lastName].filter(Boolean).join(" ").trim()

		return {
			email: doc.email,
			firstName,
			lastName,
			displayName: fullName || String(doc.email).split("@")[0],
			isAdmin: isAdminRole(doc.role),
		}
	} catch (error: any) {
		console.error("[event-owner] Owner lookup failed:", error?.message || error)
		return null
	}
}
