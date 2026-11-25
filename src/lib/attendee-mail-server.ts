import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { Types } from "mongoose"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { guestEmailKey } from "@/lib/guest-import"
import { isTypedEmail } from "@/lib/email-list"
import { stripHtml } from "@/utils/text"
import type { AttendeeMailingGroup } from "@/models/admin/attendee-mailings"

/**
 * Server side of the admin "Email Attendees" page — SERVER ONLY (loads models).
 */

export const ATTENDEE_GROUPS: AttendeeMailingGroup[] = ["booked", "pending", "invited"]

/** Booking statuses that never made someone an attendee. `pending` is its own group. */
const DEAD_BOOKING_STATUSES = ["cancelled", "rejected", "failed", "refunded"]

/** Session + admin role, or the response is already sent and null comes back. */
export async function requireAdminSession(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)
	if (!session?.user) {
		res.status(401).json({ error: "Unauthorized. Please login." })
		return null
	}
	const role = (session.user as any)?.role
	if (role !== "admin" && role !== "super admin") {
		res.status(403).json({ error: "Admins only." })
		return null
	}
	return session
}

export const parseGroups = (raw: unknown): AttendeeMailingGroup[] => {
	const list = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
		.map((g) => String(g).trim().toLowerCase())
		.filter((g): g is AttendeeMailingGroup => (ATTENDEE_GROUPS as string[]).includes(g))
	return Array.from(new Set(list))
}

export const parseEventIds = (raw: unknown): Types.ObjectId[] => {
	const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",")
	const ids = list.map((id) => String(id).trim()).filter((id) => Types.ObjectId.isValid(id))
	return Array.from(new Set(ids)).map((id) => new Types.ObjectId(id))
}

/**
 * A stored name worth showing. Rows exist with names like ". ." or "-" (typed to get past a required
 * field); those read as broken on screen and in "Hi . .,", so anything with no letter or digit
 * counts as no name and the address is shown instead.
 */
export const cleanPersonName = (raw: unknown): string => {
	const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 100)
	return /[\p{L}\p{N}]/u.test(name) ? name : ""
}

export type AttendeeSource = {
	eventId: string
	eventName: string
	group: AttendeeMailingGroup
	/** Invitations only: their answer (`pending` / `accepted` / `declined` / `cancelled`, as stored). */
	inviteStatus?: string
	/** Invitations only: sent by email (`send-invites.ts`) or in the app ("Invite Jetzy users"). */
	inviteVia?: "email" | "app"
}
export type Attendee = { email: string; name: string; sources: AttendeeSource[] }

/**
 * Everyone linked to the given events in the chosen groups, one row per address.
 *
 *  - booked  — a live booking: anything not pending and not cancelled/rejected/failed/refunded.
 *              Classified by EXCLUSION, so `checked_in` (written by the mobile app) counts.
 *  - pending — a booking still awaiting the host's approval.
 *  - invited — ANY invitation to the event, whatever its answer, read through
 *              `fetchEventInvitations` (`src/lib/event-invitations.ts`). The collection holds two
 *              shapes — ours `{ eventId, email }` and the backend's `{ event, recipient }` from
 *              "Invite Jetzy users" — and a plain `EventInvitation.find({ eventId })` misses every
 *              app invite (307 of 409 rows on staging). Never query it directly.
 *
 * Merged case-insensitively (`customerEmail` is not stored lowercased). A booking's name wins over
 * an invitation's — it is what the person typed for themselves.
 */
export async function collectAttendees(eventIds: Types.ObjectId[], groups: AttendeeMailingGroup[]): Promise<Attendee[]> {
	if (!eventIds.length || !groups.length) return []

	const { ensureDbConnected } = await import("@/configs/database")
	await ensureDbConnected()
	const { Events } = await import("@/models/events")
	const { Bookings } = await import("@/models/events/bookings")
	const { fetchEventInvitations } = await import("@/lib/event-invitations")

	const events = await Events.find({ _id: { $in: eventIds } }).select("name").lean()
	const eventName = new Map((events as any[]).map((e) => [String(e._id), stripHtml(e.name || "") || "Untitled event"]))

	// Booking names for EVERY live or pending booking on these events, whichever groups are ticked.
	// A person's name used to depend on the filters — their booking name with "Booked" ticked, their
	// invitation name without it (QA, 2026-11-23). The booking name is what they typed themselves,
	// so it always wins when there is one.
	const bookings = await Bookings.find({ eventId: { $in: eventIds }, isDeleted: { $ne: true }, status: { $nin: DEAD_BOOKING_STATUSES } })
		.select("eventId customerEmail customerName status")
		.lean()
	const bookingName = new Map<string, string>()
	for (const b of bookings as any[]) {
		const email = String(b.customerEmail ?? "").trim()
		const name = cleanPersonName(b.customerName)
		if (email && name && !bookingName.has(guestEmailKey(email))) bookingName.set(guestEmailKey(email), name)
	}

	const byKey = new Map<string, Attendee>()
	const add = (
		rawEmail: unknown,
		rawName: unknown,
		eventId: unknown,
		group: AttendeeMailingGroup,
		invite?: { status: string; via: "email" | "app" },
	) => {
		const email = String(rawEmail ?? "").trim()
		if (!email || !isTypedEmail(email)) return
		const key = guestEmailKey(email)
		const name = bookingName.get(key) || cleanPersonName(rawName)
		const source: AttendeeSource = {
			eventId: String(eventId),
			eventName: eventName.get(String(eventId)) || "Event",
			group,
			...(invite ? { inviteStatus: invite.status, inviteVia: invite.via } : {}),
		}

		const existing = byKey.get(key)
		if (!existing) {
			byKey.set(key, { email: key, name, sources: [source] })
			return
		}
		// One label per event + group + (for an invitation) answer and channel — invited by email AND
		// in the app shows both, the same invitation twice shows once.
		const same = (s: AttendeeSource) =>
			s.eventId === source.eventId && s.group === source.group && s.inviteStatus === source.inviteStatus && s.inviteVia === source.inviteVia
		if (!existing.sources.some(same)) existing.sources.push(source)
		if (!existing.name && name) existing.name = name
	}

	const wantBooked = groups.includes("booked")
	const wantPending = groups.includes("pending")
	for (const b of bookings as any[]) {
		const group: AttendeeMailingGroup = b.status === "pending" ? "pending" : "booked"
		if ((group === "booked" && wantBooked) || (group === "pending" && wantPending)) add(b.customerEmail, b.customerName, b.eventId, group)
	}

	if (groups.includes("invited")) {
		// Every invitation, both shapes, every answer. App invitees' addresses are resolved inside
		// `fetchEventInvitations`; one with no address on their account can't be emailed and is skipped.
		const perEvent = await Promise.all(eventIds.map((id) => fetchEventInvitations(String(id))))
		perEvent.forEach((invites, i) => {
			const eventId = String(eventIds[i])
			for (const inv of invites) add(inv.email, inv.name, eventId, "invited", { status: inv.status || "pending", via: inv.source })
		})
	}

	return Array.from(byKey.values()).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
}

/** An event in the shape the page's pickers use. One mapping for the list and the detail route. */
export function toEventOption(e: any) {
	return {
		_id: String(e._id),
		name: stripHtml(e.name || "") || "Untitled event",
		slug: e.slug || "",
		startsOn: e.startsOn || null,
		endsOn: e.endsOn || null,
		timezone: e.timezone || "",
		location: e.location || e.venueName || "",
		// A short plain-text excerpt for the prefilled email body; the admin edits from there.
		summary: stripHtml(e.description || "").replace(/\s+/g, " ").slice(0, 400),
		privacy: e.privacy || "public",
		status: e.status || "",
		datePoll: !!e.datePoll?.isActive,
	}
}

/** Fields `toEventOption` reads — use as the `.select()` so the two can't drift. */
export const EVENT_OPTION_FIELDS = "name slug startsOn endsOn timezone location venueName description privacy status datePoll.isActive"

const DRAFT_SUBJECT_MAX = 300
const DRAFT_MESSAGE_MAX = 200 * 1024
const DRAFT_EXCLUDED_MAX = 10000

export type DraftFields = {
	subject: string
	message: string
	promotedEventId?: Types.ObjectId
	sourceEventIds: Types.ObjectId[]
	groups: AttendeeMailingGroup[]
	extraPeople: { email: string; name?: string; source: "added" | "imported" }[]
	excludedEmails: string[]
	attachments: any[]
	greetByName: boolean
	/** "" = the usual sender / "Jetzy". */
	fromEmail: string
	fromName: string
}

/**
 * Validates a draft. A draft may be INCOMPLETE — no subject, nobody picked — but never malformed:
 * every address must be one, every id an id, the attachment list must pass the blast rules.
 * Returns the cleaned fields, or an error sentence.
 */
export async function parseDraftBody(body: any): Promise<{ fields: DraftFields } | { error: string }> {
	const { blastAttachmentRefusal } = await import("@/lib/blast-attachments")
	const { ATTENDEE_MAIL_MAX } = await import("@/lib/email-list")

	const subject = typeof body?.subject === "string" ? body.subject.trim() : ""
	const message = typeof body?.message === "string" ? body.message : ""
	if (subject.length > DRAFT_SUBJECT_MAX) return { error: `Keep the subject under ${DRAFT_SUBJECT_MAX} characters.` }
	if (message.length > DRAFT_MESSAGE_MAX) return { error: "The message is too long to save." }

	let promotedEventId: Types.ObjectId | undefined
	if (typeof body?.promotedEventId === "string" && body.promotedEventId.trim()) {
		if (!Types.ObjectId.isValid(body.promotedEventId)) return { error: "The linked event isn't valid." }
		promotedEventId = new Types.ObjectId(body.promotedEventId)
	}

	const rawExtras: any[] = Array.isArray(body?.extraPeople) ? body.extraPeople : []
	if (rawExtras.length > ATTENDEE_MAIL_MAX) return { error: `At most ${ATTENDEE_MAIL_MAX} added people in a draft.` }
	const seen = new Set<string>()
	const extraPeople: DraftFields["extraPeople"] = []
	for (const p of rawExtras) {
		const email = String(p?.email ?? "").trim()
		if (!isTypedEmail(email)) return { error: `Not a valid email address: ${email || "(empty)"}` }
		const key = guestEmailKey(email)
		if (seen.has(key)) continue
		seen.add(key)
		const name = String(p?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 100)
		extraPeople.push({ email: key, ...(name ? { name } : {}), source: p?.source === "imported" ? "imported" : "added" })
	}

	const rawExcluded: any[] = Array.isArray(body?.excludedEmails) ? body.excludedEmails : []
	if (rawExcluded.length > DRAFT_EXCLUDED_MAX) return { error: "Too many unticked people to save in one draft." }
	const excludedEmails = Array.from(new Set(rawExcluded.map((e) => guestEmailKey(String(e ?? ""))).filter((e) => isTypedEmail(e))))

	const { normalizeFromEmail, normalizeFromName } = await import("@/lib/mail-sender")
	const fromEmail = normalizeFromEmail(body?.fromEmail)
	if ("error" in fromEmail) return { error: fromEmail.error }
	const fromName = normalizeFromName(body?.fromName)
	if ("error" in fromName) return { error: fromName.error }

	const attachments: any[] = Array.isArray(body?.attachments) ? body.attachments : []
	const refusal = blastAttachmentRefusal(attachments)
	if (refusal) return { error: refusal }

	return {
		fields: {
			subject,
			message,
			promotedEventId,
			sourceEventIds: parseEventIds(body?.sourceEventIds),
			groups: parseGroups(body?.groups),
			extraPeople,
			excludedEmails,
			attachments,
			greetByName: body?.greetByName !== false,
			fromEmail: fromEmail.email,
			fromName: fromName.name,
		},
	}
}
