import { Types } from "mongoose"

/**
 * Reading the `eventinvitations` collection, which holds TWO different document shapes.
 *
 * The collection is SHARED with the Jetzy backend and the two writers store different things:
 *
 *   ours   (`send-invites.ts`)   { eventId, email, name, status, invitedAt }
 *   theirs (`/v2/events/:id/members/invite`, reached via our `invite-jetzy-user.ts`)
 *                                { event, recipient, inviteCode, channel, isUser, status, createdAt }
 *
 * Note `event` vs `eventId`, and `recipient` (a user id) vs `email`. On staging 307 of 409 rows
 * are theirs. Both read paths used to query `{ eventId }` and read `.email`, so **every guest
 * invited through "Invite Jetzy users" was invisible in the portal** — the host pressed invite,
 * the backend recorded it, and the guest list showed nothing.
 *
 * This lives in one place because that is exactly what went wrong: two endpoints each carrying
 * their own half-right idea of what an invitation looks like. Anything that needs invitations
 * calls `fetchEventInvitations` and gets one field set back.
 *
 * Server only — it loads the mongoose models.
 */

export type InvitationSource = "email" | "app"

export type NormalisedInvitation = {
	_id: string
	eventId: string
	email: string
	name: string
	/**
	 * `pending` | `accepted` | `declined` | `cancelled`. Deliberately a plain string: `cancelled`
	 * is written by the backend and is NOT in our schema enum, and an unrecognised value from an
	 * external writer must be readable rather than rejected.
	 */
	status: string
	invitedAt: string | null
	/** Which door the invite came through. */
	source: InvitationSource
	/** App invites only — the Jetzy user who was invited. */
	recipientId?: string
	inviteCode?: string
	channel?: string
}

/**
 * Every invitation for an event, both shapes, normalised and newest first.
 *
 * @param eventId a 24-hex id. Callers validate it; this assumes it is already known good.
 */
export async function fetchEventInvitations(eventId: string): Promise<NormalisedInvitation[]> {
	const { ensureDbConnected } = await import("@/configs/database")
	await ensureDbConnected()
	const { EventInvitation } = await import("@/models/events/event-invitations")
	const { Users } = await import("@/models/userModal")
	const { EventUsers } = await import("@/models/eventUsersModal")

	const objectId = new Types.ObjectId(eventId)
	// Both id fields, and both types for each — rows written by different services have been seen
	// holding the id as a string as well as an ObjectId.
	const ids = [objectId, eventId] as any[]

	// RAW DRIVER, deliberately. `event` is not on our schema, and a Mongoose query strips unknown
	// paths whenever `strictQuery` is on — which would reduce this filter to `$or: [{eventId}, {}]`
	// and return EVERY invitation in the collection, for every event. That is a silent,
	// catastrophic failure mode riding on a global default, so the query goes straight to the
	// collection where no casting can rewrite it.
	const rows: any[] = await EventInvitation.collection
		.find({ $or: [{ eventId: { $in: ids } }, { event: { $in: ids } }] })
		.sort({ invitedAt: -1, createdAt: -1 })
		.toArray()

	// Resolve the app invites' recipients to a name and address in ONE pass per collection rather
	// than a lookup per row. Same dual `Users` / `EventUsers` search the rest of the codebase
	// uses — one person can hold a document in either.
	const recipientIds = Array.from(
		new Set(
			rows
				.filter((r) => !r.email && r.recipient)
				.map((r) => String(r.recipient))
				.filter((id) => Types.ObjectId.isValid(id)),
		),
	)

	const people = new Map<string, { email: string; name: string }>()
	if (recipientIds.length) {
		const objectIds = recipientIds.map((id) => new Types.ObjectId(id))
		const projection = "email firstName lastName name"
		const [appUsers, portalUsers] = await Promise.all([
			Users.find({ _id: { $in: objectIds } }).select(projection).lean(),
			EventUsers.find({ _id: { $in: objectIds } }).select(projection).lean(),
		])
		for (const doc of [...(portalUsers as any[]), ...(appUsers as any[])]) {
			const full = [doc?.firstName, doc?.lastName].filter(Boolean).join(" ").trim()
			people.set(String(doc._id), { email: doc?.email || "", name: full || doc?.name || "" })
		}
	}

	return rows.map((r) => {
		const isApp = !r.email && !!r.recipient
		const person = isApp ? people.get(String(r.recipient)) : undefined
		return {
			_id: String(r._id),
			eventId: String(r.eventId ?? r.event ?? eventId),
			email: r.email || person?.email || "",
			name: r.name || person?.name || "",
			status: r.status || "pending",
			// Their rows carry `createdAt`; ours carry `invitedAt`.
			invitedAt: r.invitedAt ?? r.createdAt ?? null,
			source: isApp ? "app" : "email",
			...(isApp ? { recipientId: String(r.recipient), inviteCode: r.inviteCode, channel: r.channel } : {}),
		}
	})
}

/** Has this person actually said yes? Everything else is still an outstanding invitation. */
export const isAcceptedInvitation = (invitation: { status?: string }) => invitation?.status === "accepted"
