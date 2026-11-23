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

export type AttendeeSource = { eventId: string; eventName: string; group: AttendeeMailingGroup }
export type Attendee = { email: string; name: string; sources: AttendeeSource[] }

/**
 * Everyone linked to the given events in the chosen groups, one row per address.
 *
 *  - booked  — a live booking: anything not pending and not cancelled/rejected/failed/refunded.
 *              Classified by EXCLUSION, so `checked_in` (written by the mobile app) counts.
 *  - pending — a booking still awaiting the host's approval.
 *  - invited — an email invitation to the event, whatever its answer.
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
	const { EventInvitation } = await import("@/models/events/event-invitations")

	const events = await Events.find({ _id: { $in: eventIds } }).select("name").lean()
	const eventName = new Map((events as any[]).map((e) => [String(e._id), stripHtml(e.name || "") || "Untitled event"]))

	const byKey = new Map<string, Attendee & { nameFromBooking: boolean }>()
	const add = (rawEmail: unknown, rawName: unknown, eventId: unknown, group: AttendeeMailingGroup, fromBooking: boolean) => {
		const email = String(rawEmail ?? "").trim()
		if (!email || !isTypedEmail(email)) return
		const key = guestEmailKey(email)
		const name = String(rawName ?? "").replace(/\s+/g, " ").trim()
		const source: AttendeeSource = { eventId: String(eventId), eventName: eventName.get(String(eventId)) || "Event", group }

		const existing = byKey.get(key)
		if (!existing) {
			byKey.set(key, { email: key, name, sources: [source], nameFromBooking: fromBooking && !!name })
			return
		}
		if (!existing.sources.some((s) => s.eventId === source.eventId && s.group === source.group)) existing.sources.push(source)
		if (name && (!existing.name || (fromBooking && !existing.nameFromBooking))) {
			existing.name = name
			existing.nameFromBooking = fromBooking
		}
	}

	const wantBooked = groups.includes("booked")
	const wantPending = groups.includes("pending")
	if (wantBooked || wantPending) {
		const statusFilter =
			wantBooked && wantPending
				? { $nin: DEAD_BOOKING_STATUSES }
				: wantPending
					? "pending"
					: { $nin: [...DEAD_BOOKING_STATUSES, "pending"] }
		const bookings = await Bookings.find({ eventId: { $in: eventIds }, isDeleted: { $ne: true }, status: statusFilter })
			.select("eventId customerEmail customerName status")
			.lean()
		for (const b of bookings as any[]) {
			add(b.customerEmail, b.customerName, b.eventId, b.status === "pending" ? "pending" : "booked", true)
		}
	}

	if (groups.includes("invited")) {
		const invites = await EventInvitation.find({ eventId: { $in: eventIds } }).select("eventId email name").lean()
		for (const i of invites as any[]) add(i.email, i.name, i.eventId, "invited", false)
	}

	return Array.from(byKey.values())
		.map(({ nameFromBooking: _n, ...a }) => a)
		.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
}
