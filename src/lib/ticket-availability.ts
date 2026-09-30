import { Types } from "mongoose"
import { BookingStatus } from "@/models/events/types"
import { notEnoughLeftMessage, remainingForTicket, ticketQuantityLimit } from "@/lib/ticket-quantity"

/**
 * How many spots are left — the SERVER half of per-ticket capacity.
 *
 * SERVER ONLY. It loads `@/models/events/bookings`; the pure resolvers the event page needs are
 * in `src/lib/ticket-quantity.ts`.
 *
 * **Counted from the bookings, never from a counter.** `EventTracker.bookedTickets` is a mutable
 * running total and could not be trusted:
 *
 *  - it only exists for events created through `api/events/create` or `clone`, so anything the
 *    mobile app or an import wrote had NO tracker — and every capacity check was written
 *    `if (eventTracker)`, which made those events silently unlimited forever;
 *  - `api/bookings/delete.ts` decrements it unclamped, so it can go negative and *inflate*
 *    availability;
 *  - the non-atomic `bookedTickets += n; save()` in `bookings.ts` loses concurrent writes.
 *
 * The tracker is still written everywhere it was written before — the mobile app and the admin
 * portal read it off this shared collection. It is a mirror now, not the truth.
 */

export type TicketAvailability = {
	ticketId: string
	name?: string
	/** The ticket's own limit. `null` = unlimited. */
	limit: number | null
	sold: number
	/** `null` = unlimited. */
	remaining: number | null
}

export type EventAvailability = {
	/** Legacy event-wide ceiling from `event.capacity`. `null` when 0 or absent (= unlimited). */
	eventLimit: number | null
	eventSold: number
	eventRemaining: number | null
	tickets: TicketAvailability[]
}

export type Selection = { id: string; quantity: number; name?: string }

export type SelectionVerdict =
	| { ok: true }
	| { ok: false; reason: string; ticketId?: string; ticketName?: string; remaining: number; requested: number }

/**
 * Booking statuses that do NOT hold a spot.
 *
 * Classified by EXCLUSION, never by an allow-list of live statuses: `status` is not a closed set
 * — `checked_in` is written in production by the mobile app against this shared collection, and
 * an allow-list would stop counting those people (same rule as `booking-identity.ts` and
 * `bookings/mine.ts`).
 *
 * `PENDING` is in here because an approval request does NOT consume a seat today — the tracker
 * only ever incremented on approval, and `api/events/[eventId]/totals.ts` counts the same way.
 * The decision belongs to `bookings/approve.ts`, which refuses at capacity. Holding seats for
 * unapproved requests would let anyone lock a host's event out by requesting and never paying.
 */
const DEAD_STATUSES = [BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.FAILED, BookingStatus.PENDING]

/**
 * Tickets sold per ticket id, plus the event-wide total.
 *
 * `excludeBookingId` leaves one booking out of the count — used when a host edits that very
 * booking's quantity, so they aren't blocked by the seats it already holds.
 */
async function soldCounts(eventId: string, excludeBookingId?: string): Promise<{ byTicket: Map<string, number>; total: number }> {
	const { ensureDbConnected } = await import("@/configs/database")
	await ensureDbConnected()
	const { Bookings } = await import("@/models/events/bookings")

	const match: Record<string, any> = {
		eventId: new Types.ObjectId(String(eventId)),
		// `$ne: true`, NOT `isDeleted: false`. Rows written by the mobile app and the admin
		// portal against this shared collection can carry no `isDeleted` field at all, and an
		// equality match drops every one of them — the same trap recorded for referral codes.
		// Under-counting here oversells the event. (`totals.ts` still uses `false` and therefore
		// under-counts those rows; don't copy it.)
		isDeleted: { $ne: true },
		status: { $nin: DEAD_STATUSES },
	}
	if (excludeBookingId && Types.ObjectId.isValid(excludeBookingId)) {
		match._id = { $ne: new Types.ObjectId(excludeBookingId) }
	}

	const rows = await Bookings.aggregate([
		{ $match: match },
		{
			$project: {
				tickets: 1,
				// A register-only booking carries no ticket rows but is still a person in the
				// room — it counts as one spot against the event total and against no ticket.
				// Same rule as `totals.ts`.
				spots: {
					$let: {
						vars: { q: { $sum: { $ifNull: ["$tickets.quantity", []] } } },
						in: { $cond: [{ $gt: ["$$q", 0] }, "$$q", 1] },
					},
				},
			},
		},
		{
			$facet: {
				perTicket: [
					{ $unwind: "$tickets" },
					{ $group: { _id: "$tickets.ticketId", qty: { $sum: { $ifNull: ["$tickets.quantity", 0] } } } },
				],
				total: [{ $group: { _id: null, qty: { $sum: "$spots" } } }],
			},
		},
	])

	const facet = rows?.[0] || { perTicket: [], total: [] }
	const byTicket = new Map<string, number>()
	for (const row of facet.perTicket || []) {
		if (row?._id) byTicket.set(String(row._id), Number(row.qty) || 0)
	}

	return { byTicket, total: Number(facet.total?.[0]?.qty) || 0 }
}

/** Does this event limit anything at all? Cheap, and true of very few events. */
export const eventHasAnyLimit = (event: any): boolean =>
	(Number(event?.capacity) || 0) > 0 || (event?.tickets || []).some((t: any) => ticketQuantityLimit(t) !== null)

/**
 * Availability for every ticket on an event, plus the legacy event-wide ceiling.
 *
 * `countSold: false` skips the aggregation entirely and reports everything as unlimited —
 * correct, and not a shortcut, when nothing on the event is limited. Every legacy event is in
 * that state, and this is read on the public event page.
 */
export async function getEventAvailability(
	event: any,
	excludeBookingId?: string,
	options?: { countSold?: boolean },
): Promise<EventAvailability> {
	const countSold = options?.countSold ?? true
	const { byTicket, total } = countSold
		? await soldCounts(String(event?._id), excludeBookingId)
		: { byTicket: new Map<string, number>(), total: 0 }

	// `capacity` has no host-facing input any more, but a stored non-zero value is still
	// honoured so no live event silently becomes unlimited. 0 has always meant unlimited here.
	const storedCapacity = Number(event?.capacity) || 0
	const eventLimit = storedCapacity > 0 ? storedCapacity : null

	const tickets: TicketAvailability[] = (event?.tickets || []).map((ticket: any) => {
		const ticketId = String(ticket?._id)
		const limit = ticketQuantityLimit(ticket)
		const sold = byTicket.get(ticketId) || 0
		return { ticketId, name: ticket?.name, limit, sold, remaining: remainingForTicket(limit, sold) }
	})

	return {
		eventLimit,
		eventSold: total,
		eventRemaining: remainingForTicket(eventLimit, total),
		tickets,
	}
}

/**
 * Can this order be filled?
 *
 * Both limits apply — a ticket's own `quantity` AND the legacy event ceiling. The event ceiling
 * composes on top of the per-ticket numbers; it does not replace them. Per-ticket is checked
 * first so the refusal can name the ticket that ran out.
 */
export function checkSelection(availability: EventAvailability, selection: Selection[]): SelectionVerdict {
	const byId = new Map(availability.tickets.map((t) => [t.ticketId, t]))

	for (const row of selection) {
		const wanted = Number(row?.quantity) || 0
		if (wanted <= 0) continue

		const ticket = byId.get(String(row.id))
		// A ticket id we can't resolve is not silently allowed through — but it is also not this
		// function's job to reject it; the checkout endpoints already abort on an unknown id.
		if (!ticket || ticket.remaining === null) continue

		if (ticket.remaining < wanted) {
			const name = row.name || ticket.name
			return {
				ok: false,
				reason: notEnoughLeftMessage(ticket.remaining, name),
				ticketId: ticket.ticketId,
				ticketName: name,
				remaining: ticket.remaining,
				requested: wanted,
			}
		}
	}

	if (availability.eventRemaining !== null) {
		const requested = selection.reduce((sum, row) => sum + (Number(row?.quantity) || 0), 0)
		if (requested > availability.eventRemaining) {
			return {
				ok: false,
				reason: notEnoughLeftMessage(availability.eventRemaining),
				remaining: availability.eventRemaining,
				requested,
			}
		}
	}

	return { ok: true }
}

/**
 * The one-call form every checkout path uses: load the counts, judge the order.
 * Returns `{ ok: true }` on an event with no limits anywhere, without touching the database.
 */
export async function verifyAvailability(
	event: any,
	selection: Selection[],
	excludeBookingId?: string,
): Promise<SelectionVerdict & { availability?: EventAvailability }> {
	if (!eventHasAnyLimit(event)) return { ok: true }

	const availability = await getEventAvailability(event, excludeBookingId)
	return { ...checkSelection(availability, selection), availability }
}
