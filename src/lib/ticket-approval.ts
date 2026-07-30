/**
 * Single source of truth for "does this ticket require host approval?".
 *
 * Approval used to be a per-event flag that only applied to free/RSVP registrations.
 * It is now per-ticket, with the event-level flag acting as the default for any ticket
 * that hasn't set its own. That tri-state (`true` / `false` / `undefined` = inherit) is
 * what lets every pre-existing event keep working without a data migration.
 *
 * Kept free of server imports so client components can use it directly.
 */

export type ApprovalTicketLike = {
	_id?: unknown
	id?: unknown
	requireApproval?: boolean
	price?: number | string
}

export type ApprovalEventLike = {
	requireApproval?: boolean
	tickets?: ApprovalTicketLike[] | null
}

const idOf = (t?: ApprovalTicketLike | null): string | undefined => {
	const raw = t?._id ?? t?.id
	return raw === undefined || raw === null ? undefined : String(raw)
}

/** Resolve the flag for a ticket object. The ticket's own value wins; `undefined` inherits. */
export const ticketApprovalFlag = (event?: ApprovalEventLike | null, ticket?: ApprovalTicketLike | null): boolean => {
	if (ticket && typeof ticket.requireApproval === "boolean") return ticket.requireApproval
	return !!event?.requireApproval
}

/** Resolve the flag by ticket id against `event.tickets`. Falls back to the event default. */
export const ticketRequiresApproval = (event?: ApprovalEventLike | null, ticketId?: string | null): boolean => {
	if (!ticketId) return !!event?.requireApproval
	const ticket = (event?.tickets || []).find((t) => idOf(t) === String(ticketId))
	return ticketApprovalFlag(event, ticket)
}

/**
 * True when ANY ticket on the event needs approval. Drives the Approvals tab and the
 * event-level banners — those must appear even if only one ticket is flagged.
 */
export const eventHasAnyApprovalTicket = (event?: ApprovalEventLike | null): boolean => {
	const tickets = event?.tickets || []
	if (tickets.length === 0) return !!event?.requireApproval
	return tickets.some((t) => ticketApprovalFlag(event, t))
}

/** True when every ticket on the event needs approval (used to pick banner wording). */
export const eventRequiresApprovalForAllTickets = (event?: ApprovalEventLike | null): boolean => {
	const tickets = event?.tickets || []
	if (tickets.length === 0) return !!event?.requireApproval
	return tickets.every((t) => ticketApprovalFlag(event, t))
}

/**
 * Whether the current checkout selection needs approval. Ticket selection is
 * single-select (one ticket type per checkout), so in practice this is just the
 * selected ticket — but `.some()` keeps it correct if that ever changes.
 */
export const selectionRequiresApproval = (
	event?: ApprovalEventLike | null,
	selected?: Array<{ id?: unknown; _id?: unknown; requireApproval?: boolean }> | null,
): boolean => {
	if (!selected?.length) return !!event?.requireApproval
	return selected.some((s) => {
		// Prefer the flag carried on the selection itself; fall back to the event lookup.
		if (typeof s.requireApproval === "boolean") return s.requireApproval
		return ticketRequiresApproval(event, idOf(s))
	})
}
