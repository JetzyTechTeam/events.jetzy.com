/**
 * Which tickets a referral code works on.
 *
 * Pure and isomorphic — the checkout modal previews the discount with the same functions both
 * checkout endpoints charge with, so the preview can't promise what checkout won't honour.
 *
 * Rules:
 *   - `ticketIds` absent or empty = EVERY ticket. That is every code created before scoping
 *     existed, and every code the mobile app / admin portal writes.
 *   - A non-empty list covers exactly those ids. If they have all been deleted from the event
 *     the code covers NOTHING — a stale list must never widen back to "all tickets".
 *   - The discount applies to eligible tickets only; the rest of the order pays full price.
 */

export type ReferralTicketScope = { ticketIds?: string[] | null } | null | undefined

export type ReferralOrderRow = { id: string; price: number | string; quantity: number | string }

export const REFERRAL_NOT_FOR_SELECTION_MESSAGE = "This code doesn't apply to the tickets you selected"

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const referralAppliesToAllTickets = (code: ReferralTicketScope): boolean =>
	!code || !Array.isArray(code.ticketIds) || code.ticketIds.length === 0

export const referralCoversTicket = (code: ReferralTicketScope, ticketId: string | undefined | null): boolean => {
	if (referralAppliesToAllTickets(code)) return true
	if (!ticketId) return false
	return (code!.ticketIds as string[]).map(String).includes(String(ticketId))
}

/** True when at least one of the selected tickets is one the code works on. */
export const selectionHasEligibleTicket = (code: ReferralTicketScope, ticketIds: Array<string | undefined | null>): boolean =>
	ticketIds.some((id) => referralCoversTicket(code, id))

/** The part of the order the referral percentage is taken off. */
export const referralEligibleSubtotal = (code: ReferralTicketScope, rows: ReferralOrderRow[]): number =>
	round2(
		rows.reduce((sum, row) => {
			if (!referralCoversTicket(code, row.id)) return sum
			return sum + (Number(row.price) || 0) * (Number(row.quantity) || 0)
		}, 0),
	)

/**
 * Server-side: turns the host's submitted ticket ids into what gets stored.
 *   - omitted or empty → `undefined` (every ticket)
 *   - otherwise deduped and filtered to ids actually on this event; a list that resolves to
 *     none is refused rather than silently stored as "all tickets".
 */
export const resolveReferralTicketIds = (
	event: { tickets?: Array<{ _id?: any }> } | null | undefined,
	submitted: string[] | undefined | null,
): { ok: true; ticketIds: string[] | undefined } | { ok: false; message: string } => {
	if (!Array.isArray(submitted) || submitted.length === 0) return { ok: true, ticketIds: undefined }
	const live = new Set((event?.tickets || []).map((t) => String(t?._id)))
	const ticketIds = Array.from(new Set(submitted.map(String))).filter((id) => live.has(id))
	if (ticketIds.length === 0) return { ok: false, message: "Pick at least one ticket on this event, or choose All tickets." }
	return { ok: true, ticketIds }
}

/**
 * The ticket ids of a scoped code that still exist on the event. Used by the host UI to spot a
 * code whose tickets were all deleted (it then works on nothing).
 */
export const liveScopedTicketIds = (code: ReferralTicketScope, eventTickets: Array<{ _id?: any }> | undefined): string[] => {
	if (referralAppliesToAllTickets(code)) return []
	const live = new Set((eventTickets || []).map((t) => String(t?._id)))
	return (code!.ticketIds as string[]).map(String).filter((id) => live.has(id))
}
