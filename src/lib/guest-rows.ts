import { isPendingBooking, isCancelledBooking } from "@/lib/booking-status"
import { bookingTicketCount } from "@/lib/booking-approval"

/**
 * One row per PERSON for the Guests tab, built from two collections that share no key.
 *
 * `eventinvitations` records who was invited (email, status, timestamps). `bookings` records
 * who actually holds a ticket. **Nothing in the schema links them** — there is no `bookingId`
 * on an invitation and no `invitationId` on a booking — so the join is the email string and
 * nothing else. That makes two rules non-negotiable:
 *
 *  - **Lowercase both sides.** `Bookings.customerEmail` has no `lowercase: true`, so the same
 *    person can be `Ali@x.com` on the invitation and `ali@x.com` on the booking. An exact
 *    comparison renders them as two separate people, which is the bug this module exists to
 *    prevent: "invited" and "booked" would look like two guests instead of one.
 *  - **Never collapse a person to a single booking.** One email can hold a confirmed booking
 *    AND a pending request. The previous merge kept one of the two, so a host approving from
 *    this tab could have been shown the wrong one.
 *
 * Pure and client-safe — no mongoose, no fetching.
 */

export type GuestRowKind = "invited" | "booked" | "invited_and_booked"

export type InvitationStatus = "pending" | "accepted" | "declined"

export type GuestRow = {
	/** Lowercased email. The join key and the React key. */
	key: string
	/** Best display casing — the booking's address wins, being the one the guest typed to pay. */
	email: string
	name: string
	kind: GuestRowKind

	invitation: any | null
	invitationStatus: InvitationStatus | null
	invitedAt: string | null
	/** How many invitation documents exist for this address. >1 means they were invited again. */
	duplicateInvitationCount: number

	/** Every live booking for this address, newest first. `isDeleted` excluded. */
	bookings: any[]
	/** Drives the descriptive columns only. Approvals iterate `pendingBookings` instead. */
	primaryBooking: any | null
	/** Bookings awaiting a host decision — the ones that carry Approve / Reject. */
	pendingBookings: any[]

	confirmedTicketCount: number
	pendingTicketCount: number
	/** Has bookings, but every one of them is cancelled / rejected / failed. */
	cancelledOnly: boolean
}

const key = (email?: string | null) => (email || "").trim().toLowerCase()

const time = (value: any) => {
	const t = new Date(value || 0).getTime()
	return Number.isFinite(t) ? t : 0
}

/**
 * Which of several invitations to the same address represents the person's state.
 *
 * There is no unique index on `(eventId, email)` and `send-invites.ts` creates unconditionally,
 * so re-inviting somebody writes a second `pending` document. Newest-wins would then reset an
 * "accepted" back to "Invited" — telling the host their guest never replied. Decided state
 * therefore outranks undecided, and the timestamp only breaks ties.
 */
const INVITATION_RANK: Record<InvitationStatus, number> = { accepted: 3, declined: 2, pending: 1 }

const betterInvitation = (a: any, b: any) => {
	const ra = INVITATION_RANK[(a?.status as InvitationStatus) ?? "pending"] ?? 0
	const rb = INVITATION_RANK[(b?.status as InvitationStatus) ?? "pending"] ?? 0
	if (ra !== rb) return ra > rb ? a : b
	return time(a?.invitedAt) >= time(b?.invitedAt) ? a : b
}

export const buildGuestRows = ({
	invitations,
	bookings,
}: {
	invitations: any[]
	bookings: any[]
}): GuestRow[] => {
	const invitationByEmail = new Map<string, any>()
	const invitationCount = new Map<string, number>()
	for (const inv of invitations || []) {
		const k = key(inv?.email)
		// An invitation with no address cannot be joined to anything and cannot be acted on.
		if (!k) continue
		invitationCount.set(k, (invitationCount.get(k) || 0) + 1)
		const held = invitationByEmail.get(k)
		invitationByEmail.set(k, held ? betterInvitation(held, inv) : inv)
	}

	const bookingsByEmail = new Map<string, any[]>()
	for (const b of bookings || []) {
		// `/api/get-bookings` does not filter `isDeleted`. A removed booking must not appear as
		// a guest, nor be counted into a ticket total, nor offer an Approve button.
		if (b?.isDeleted) continue
		const k = key(b?.customerEmail)
		if (!k) continue
		bookingsByEmail.set(k, [...(bookingsByEmail.get(k) || []), b])
	}

	const keys = new Set<string>([...Array.from(invitationByEmail.keys()), ...Array.from(bookingsByEmail.keys())])

	const rows: GuestRow[] = Array.from(keys).map((k) => {
		const invitation = invitationByEmail.get(k) || null
		const all = (bookingsByEmail.get(k) || []).slice().sort((a, b) => time(b?.createdAt) - time(a?.createdAt))

		const pendingBookings = all.filter((b) => isPendingBooking(b))
		// Classify by EXCLUSION, never by allowlisting BookingStatus.CONFIRMED — `status` is not
		// a closed set, and `checked_in` is written by the mobile app against this collection.
		const live = all.filter((b) => !isPendingBooking(b) && !isCancelledBooking(b))

		const primaryBooking = live[0] || pendingBookings[0] || all[0] || null

		const kind: GuestRowKind = invitation && all.length > 0 ? "invited_and_booked" : all.length > 0 ? "booked" : "invited"

		return {
			key: k,
			email: primaryBooking?.customerEmail || invitation?.email || k,
			name: primaryBooking?.customerName || invitation?.name || "",
			kind,
			invitation,
			invitationStatus: (invitation?.status as InvitationStatus) ?? null,
			invitedAt: invitation?.invitedAt ?? null,
			duplicateInvitationCount: invitationCount.get(k) || 0,
			bookings: all,
			primaryBooking,
			pendingBookings,
			confirmedTicketCount: live.reduce((sum, b) => sum + bookingTicketCount(b?.tickets), 0),
			pendingTicketCount: pendingBookings.reduce((sum, b) => sum + bookingTicketCount(b?.tickets), 0),
			cancelledOnly: all.length > 0 && live.length === 0 && pendingBookings.length === 0,
		}
	})

	// Actionable rows first — with 10 per page, a host should not have to paginate to find the
	// request waiting on them.
	const band = (row: GuestRow) => (row.pendingBookings.length > 0 ? 0 : row.cancelledOnly ? 3 : row.bookings.length > 0 ? 1 : 2)

	return rows.sort((a, b) => {
		const ba = band(a)
		const bb = band(b)
		if (ba !== bb) return ba - bb
		return (a.name || a.email).localeCompare(b.name || b.email)
	})
}

export type GuestAudience = "all" | "needs_approval" | "booked" | "invited_only" | "cancelled"

export const matchesAudience = (row: GuestRow, audience: GuestAudience): boolean => {
	switch (audience) {
		case "needs_approval":
			return row.pendingBookings.length > 0
		case "booked":
			return row.bookings.length > 0 && !row.cancelledOnly
		case "invited_only":
			return row.bookings.length === 0
		case "cancelled":
			return row.cancelledOnly
		default:
			return true
	}
}

export const GUEST_KIND_LABEL: Record<GuestRowKind, string> = {
	invited: "Invited",
	booked: "Booked",
	invited_and_booked: "Invited + Booked",
}
