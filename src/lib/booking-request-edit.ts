import { isPendingBooking, isHoldExpired } from "./booking-status"
import { bookingMemberships } from "./booking-memberships"
import { bookingTicketCount, bookingTicketTypeCount, type BookingTicketRow } from "./booking-approval"
import { ticketMemberships } from "./premium-bundle"

/**
 * Editing a PENDING approval request — its name, and how many tickets it is for.
 *
 * PURE and client-safe: the Edit dialog imports this to decide what to offer and
 * `api/bookings/update-request.ts` imports it to decide what to allow, so the two cannot
 * disagree. Never re-derive these rules inline.
 *
 * Jetzy issues NO REFUNDS, and that decides what a quantity edit may do:
 *
 *  - A FREE request has no money behind it. Its tickets are simply changed, up or down.
 *  - A request with a CARD HOLD can only go DOWN. Stripe cannot capture more than was
 *    authorized, so there is no way to charge for an added ticket without the guest paying
 *    again — and once money is captured it cannot be given back. The lower number is stored
 *    BESIDE the request (`adjustedTickets`) and applied at approval, where the existing partial
 *    capture takes less and Stripe releases the remainder at no cost. `booking.tickets` keeps
 *    describing what the card is held for until that moment.
 */

type TicketRowLike = { ticketId?: any; quantity?: any }

type RequestLike =
	| {
			status?: string
			total?: number | null
			tickets?: TicketRowLike[] | null
			adjustedTickets?: TicketRowLike[] | null
			payment?: any
	  }
	| null
	| undefined

/** Booking ticket rows as plain `{ ticketId: string, quantity: number }`, whatever they arrived as. */
export const ticketRows = (tickets?: TicketRowLike[] | null): BookingTicketRow[] =>
	(tickets || []).map((t) => ({ ticketId: String(t?.ticketId), quantity: Number(t?.quantity) || 0 }))

/**
 * - `free`   — no money and no membership behind the request: tickets change, up or down.
 * - `reduce` — a card hold, a membership, or both: DOWN only, stored as a plan
 *              (`adjustedTickets`) and applied at approval.
 * - `locked` — the quantity can't be changed (see `RequestEditLock`).
 */
export type RequestEditMode = "free" | "reduce" | "locked"

export type RequestEditLock = "multiple_ticket_types" | "in_progress" | "hold_gone" | "unknown_money"

export const REQUEST_LOCK_MESSAGE: Record<RequestEditLock, string> = {
	multiple_ticket_types:
		"This request covers more than one ticket type, so its quantity can't be changed — the price of each ticket isn't stored separately, so there is no safe way to charge for part of it.",
	in_progress: "This request is being charged right now.",
	hold_gone: "The card hold on this request is no longer active, so its quantity can't be changed.",
	unknown_money: "This request has a price but no payment record, so its quantity can't be changed.",
}

export type RequestEditModeResult = {
	mode: RequestEditMode
	lock?: RequestEditLock
	/** A live card hold sits behind the request (`authorized`, or a `failed` capture to retry). */
	hasHold: boolean
	/** The request sells a membership (Premium / Concierge) — once per order, never per ticket. */
	sellsMembership: boolean
}

/**
 * What a quantity edit may do to this request. The NAME is editable in every mode but
 * `in_progress` — the lock is about tickets.
 *
 * `failed` counts as a hold: it is a capture that didn't go through, the booking is still
 * PENDING and `approve.ts` retries it against the same authorization.
 *
 * A request that sells a membership is `reduce`, free or paid. It used to be locked; it no
 * longer needs to be, because a membership is sold ONCE PER ORDER — fewer tickets never means
 * fewer memberships — and `approvalCaptureCents` charges the membership in full while scaling
 * only the ticket part of a hold. It is never `free`, even on a $0 ticket: adding tickets there
 * would step past the per-person membership-ticket limit checkout enforces, with nothing paid.
 */
export const requestEditMode = (booking: RequestLike): RequestEditModeResult => {
	const status = booking?.payment?.status as string | undefined
	const hasHold = (status === "authorized" || status === "failed") && !isHoldExpired(booking as any)
	const sellsMembership = bookingMemberships(booking?.payment).length > 0
	const result = (mode: RequestEditMode, lock?: RequestEditLock): RequestEditModeResult => ({
		mode,
		...(lock ? { lock } : {}),
		hasHold,
		sellsMembership,
	})

	if (status === "capturing") return result("locked", "in_progress")
	if (status && !hasHold) return result("locked", "hold_gone")

	// Same test as `bookingMoneyState`: a priced total with no payment record is `unknown`,
	// and must never be treated as free.
	if (!status && Number(booking?.total ?? 0) > 0) return result("locked", "unknown_money")

	if (hasHold || sellsMembership) {
		// A partial approval scales the ticket part proportionally, which is only right when
		// every ticket in the order costs the same — see `partialApprovalRefusal`.
		if (bookingTicketTypeCount(ticketRows(booking?.tickets)) > 1) return result("locked", "multiple_ticket_types")
		return result("reduce")
	}

	return result("free")
}

const sameIdSet = (a: BookingTicketRow[], b: BookingTicketRow[]) => {
	const aIds = a.map((t) => t.ticketId)
	const bIds = b.map((t) => t.ticketId)
	return (
		aIds.length === bIds.length &&
		new Set(aIds).size === aIds.length &&
		new Set(bIds).size === bIds.length &&
		aIds.every((id) => bIds.includes(id))
	)
}

/**
 * May a HELD request be planned for this selection? Returns the refusal, or `null` when allowed.
 * A selection EQUAL to what was requested is allowed — it means "clear the plan".
 */
export const holdPlanRefusal = (stored: TicketRowLike[] | null | undefined, incoming: TicketRowLike[] | null | undefined): string | null => {
	const before = ticketRows(stored)
	const after = ticketRows(incoming)
	if (!sameIdSet(before, after)) return "This request changed — refresh and try again."

	const storedById = new Map(before.map((t) => [t.ticketId, t.quantity]))
	if (after.some((row) => row.quantity > (storedById.get(row.ticketId) ?? 0))) {
		const held = bookingTicketCount(before)
		return `The card is held for ${held} ${held === 1 ? "ticket" : "tickets"}. More can't be added — a hold can't be raised, and payments aren't refunded.`
	}
	if (bookingTicketCount(after) < 1) return "Keep at least one ticket, or decline the request instead."
	return null
}

/**
 * The tickets this request will be approved for: the saved plan when there is one, otherwise
 * what the guest asked for. THE reader of `adjustedTickets` — never read the field directly.
 *
 * A plan is honoured only on a PENDING booking and only when it is a valid reduction of what is
 * stored; anything else falls back to the request as made, which is the safe direction.
 */
export const plannedTickets = (booking: RequestLike): BookingTicketRow[] => {
	const requested = ticketRows(booking?.tickets)
	const plan = booking?.adjustedTickets
	if (!isPendingBooking(booking as any) || !Array.isArray(plan) || plan.length === 0) return requested
	if (holdPlanRefusal(requested, plan)) return requested
	// Returned in the stored row order, so callers can pair the two lists by index.
	const planById = new Map(ticketRows(plan).map((t) => [t.ticketId, t.quantity]))
	return requested.map((row) => ({ ticketId: row.ticketId, quantity: planById.get(row.ticketId) ?? row.quantity }))
}

/** True when a host/admin has lowered what this request will be approved for. */
export const isRequestAdjusted = (booking: RequestLike): boolean =>
	bookingTicketCount(plannedTickets(booking)) < bookingTicketCount(ticketRows(booking?.tickets))

/**
 * May a FREE booking's quantities be changed to this selection? Returns the refusal, or `null`.
 *
 * Shared with `api/bookings/update-tickets.ts`, which is where these three checks were written:
 *
 *  - the submitted rows must be exactly the rows on the booking (a permutation, both ways) — if
 *    they aren't, the client is working from a stale copy and the safe answer is to refuse;
 *  - at least one ticket must remain;
 *  - a row may not GROW on a ticket that is now priced or now sells a membership. The booking
 *    reads as free, but the host may have repriced or bundled the ticket since it was made, and
 *    adding seats there would hand over something nobody was charged for.
 */
export const freeTicketEditRefusal = (
	stored: TicketRowLike[] | null | undefined,
	incoming: TicketRowLike[] | null | undefined,
	eventTickets: any[] | null | undefined,
	opts: { emptyMessage?: string; staleMessage?: string } = {},
): string | null => {
	const before = ticketRows(stored)
	const after = ticketRows(incoming)
	if (!sameIdSet(before, after)) return opts.staleMessage || "This booking changed — refresh and try again."

	if (bookingTicketCount(after) <= 0) return opts.emptyMessage || "A booking needs at least one ticket. Cancel it instead."

	const eventTicketsById = new Map((eventTickets || []).map((t: any) => [String(t?._id), t]))
	const oldById = new Map(before.map((t) => [t.ticketId, t.quantity]))
	for (const row of after) {
		const ticket: any = eventTicketsById.get(row.ticketId)
		if (!ticket) continue // the ticket type was deleted; the seats still count, nothing new is granted
		const increased = row.quantity > (oldById.get(row.ticketId) || 0)
		if (!increased) continue
		if (Number(ticket.price) > 0) {
			return `"${ticket.name}" is a paid ticket — you can't add seats to it without a payment.`
		}
		if (ticketMemberships(ticket).length > 0) {
			return `"${ticket.name}" sells a membership, so its quantity can't be changed here.`
		}
	}
	return null
}

/** Longest name a booking may carry. Counted in code points, so an emoji is one. */
export const GUEST_NAME_LIMIT = 120

/**
 * A name typed by a host or admin, made safe to store and to put in an email.
 *
 * Whitespace is collapsed rather than refused (a pasted name carries tabs and newlines);
 * anything else below U+0020 is refused rather than repaired — it has no business in a name
 * and the value is interpolated into mail.
 */
export const normalizeGuestName = (raw: unknown): { ok: true; name: string } | { ok: false; message: string } => {
	if (typeof raw !== "string") return { ok: false, message: "Enter a name." }
	const name = raw.replace(/\s+/g, " ").trim()
	if (!name) return { ok: false, message: "Enter a name." }
	if (/[\u0000-\u001F\u007F]/.test(name)) return { ok: false, message: "That name contains characters that can't be used." }
	if (Array.from(name).length > GUEST_NAME_LIMIT) {
		return { ok: false, message: `Keep the name to ${GUEST_NAME_LIMIT} characters or fewer.` }
	}
	return { ok: true, name }
}
