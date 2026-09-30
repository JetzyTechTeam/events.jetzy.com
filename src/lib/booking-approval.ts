import type { EventAvailability } from "@/lib/ticket-availability"

/**
 * Does a pending request fit in what's left — and if not, how much of it does?
 *
 * PURE and client-safe: the Approvals table imports this to decide what to offer, and
 * `api/bookings/approve.ts` imports it to decide what to allow. They must reach the same answer
 * or the host is shown a button that the server then refuses. Only the TYPE is imported from
 * `ticket-availability` (server only) — no runtime dependency on it.
 *
 * Why a request can exceed what's left at all: a PENDING approval request does not hold a seat.
 * Seats are consumed on approval. So a host can legitimately collect four requests for three
 * seats — that is the point of an approval event — and the squeeze only appears when they start
 * letting people in.
 */

export type BookingTicketRow = { ticketId: string; quantity: number }

export type ApprovalFit = {
	/** Total tickets the guest asked for. */
	requested: number
	/**
	 * How many can actually be seated right now. Equal to `requested` when the request fits.
	 * `null` means unlimited — nothing constrains it.
	 */
	seatable: number | null
	/** True when the whole request fits (including the unlimited case). */
	fits: boolean
	/** Which ticket ran out, for the message. */
	blockingTicketName?: string
}

/** Sum of a booking's ticket quantities. */
export const bookingTicketCount = (tickets?: BookingTicketRow[] | null): number =>
	(tickets || []).reduce((sum, t) => sum + (Number(t?.quantity) || 0), 0)

/** How many distinct ticket types a booking holds. */
export const bookingTicketTypeCount = (tickets?: BookingTicketRow[] | null): number =>
	new Set((tickets || []).filter((t) => (Number(t?.quantity) || 0) > 0).map((t) => String(t.ticketId))).size

/**
 * How much of this request can be seated.
 *
 * Both limits apply — the ticket's own remaining AND the event-wide ceiling — and the smaller
 * one wins, the same composition `EventTicketsComponent` uses for the guest-facing stepper.
 *
 * `availability` missing (still loading, or the event has no limits at all) reads as unlimited.
 * That is the safe direction here: the server re-checks before anything is seated, so the worst
 * case is a refusal the host can act on, not an oversell.
 */
export const approvalFit = (
	tickets: BookingTicketRow[] | null | undefined,
	availability: EventAvailability | null | undefined,
): ApprovalFit => {
	const requested = bookingTicketCount(tickets)
	if (!availability) return { requested, seatable: null, fits: true }

	let seatable: number | null = null
	let blockingTicketName: string | undefined

	// Per-ticket. A multi-type booking is summed, which is right for the total but is also why
	// `canPartiallyApprove` refuses to reduce one — see below.
	for (const row of tickets || []) {
		const wanted = Number(row?.quantity) || 0
		if (wanted <= 0) continue
		const info = availability.tickets.find((t) => t.ticketId === String(row.ticketId))
		if (!info || info.remaining === null) continue // unlimited ticket — contributes no limit

		const canSeat = Math.min(wanted, info.remaining)
		seatable = (seatable ?? 0) + canSeat
		// Count every unconstrained row in full, or a mixed booking would under-report.
		if (canSeat < wanted && !blockingTicketName) blockingTicketName = info.name
	}

	// Rows on unlimited tickets were skipped above; add them back so `seatable` is a real total.
	if (seatable !== null) {
		const limitedIds = new Set(
			availability.tickets.filter((t) => t.remaining !== null).map((t) => t.ticketId),
		)
		const unlimitedQty = (tickets || [])
			.filter((row) => !limitedIds.has(String(row.ticketId)))
			.reduce((sum, row) => sum + (Number(row?.quantity) || 0), 0)
		seatable += unlimitedQty
	}

	// The event-wide ceiling caps whatever the per-ticket numbers allowed.
	if (availability.eventRemaining !== null) {
		const capped = Math.min(seatable ?? requested, availability.eventRemaining)
		seatable = capped
	}

	if (seatable === null) return { requested, seatable: null, fits: true }
	return { requested, seatable, fits: seatable >= requested, blockingTicketName }
}

export type PartialApprovalRefusal = "multiple_ticket_types" | "sells_membership" | "nothing_fits"

/**
 * May this booking be approved for FEWER tickets than were asked for?
 *
 * Two hard refusals, both about money rather than policy:
 *
 *  - **More than one ticket type.** A booking stores no per-ticket price, so a partial capture
 *    has to scale the held amount proportionally — which is only correct when every ticket in
 *    the order costs the same. Single-select checkout guarantees one type; a mobile-posted order
 *    does not, so this fails closed.
 *  - **The ticket sells a membership.** Quantity there is tied to how many subscriptions are
 *    created and to the per-event membership allowance. Reducing it silently would either
 *    over- or under-create subscriptions.
 *
 * Returns `null` when a partial approval IS allowed.
 */
export const partialApprovalRefusal = (
	tickets: BookingTicketRow[] | null | undefined,
	opts: { sellsMembership: boolean; seatable: number | null },
): PartialApprovalRefusal | null => {
	if (opts.sellsMembership) return "sells_membership"
	if (bookingTicketTypeCount(tickets) > 1) return "multiple_ticket_types"
	if (opts.seatable !== null && opts.seatable < 1) return "nothing_fits"
	return null
}

export const PARTIAL_REFUSAL_MESSAGE: Record<PartialApprovalRefusal, string> = {
	multiple_ticket_types:
		"This request covers more than one ticket type, so it can't be partly approved. Approve it when more spots free up, or decline it.",
	sells_membership:
		"This ticket also sells a membership, so its quantity can't be reduced. Approve it when more spots free up, or decline it.",
	nothing_fits: "There are no spots left at all, so none of this request can be approved right now.",
}

/** The reduced ticket list to send when seating only part of a request. */
export const buildPartialSelection = (
	tickets: BookingTicketRow[] | null | undefined,
	seatable: number,
): BookingTicketRow[] => {
	// Single ticket type is enforced by `partialApprovalRefusal` before this is ever called, so
	// there is exactly one row to reduce.
	const row = (tickets || []).find((t) => (Number(t?.quantity) || 0) > 0)
	if (!row) return []
	return [{ ticketId: String(row.ticketId), quantity: Math.max(0, Math.min(seatable, Number(row.quantity) || 0)) }]
}
