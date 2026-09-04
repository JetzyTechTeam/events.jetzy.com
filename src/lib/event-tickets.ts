import Stripe from "stripe"
import { ticketMemberships, ticketMembershipFreeMonths } from "@/lib/premium-bundle"
import { sanitizeMembershipKeys } from "@/lib/memberships"

const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

/** The client-side shape of a ticket, as both the manage form and the inline editor send it. */
export type IncomingTicket = {
	/** The stored `_id.toString()` for an existing ticket. A new one carries a client-side id. */
	id: string
	title: string
	description?: string
	price: number
	requireApproval?: boolean
	memberships?: string[]
	membershipInterval?: "month" | "year"
	membershipFreeMonths?: number
	/** @deprecated legacy mirror of `memberships` */
	includesPremium?: boolean
}

/**
 * Preserve-on-omit: an older client (or an autosave built from a stale form) may not send
 * `memberships` at all. Falling back to the stored value means such a save leaves the ticket
 * selling what it already sold, instead of silently un-bundling it.
 */
const resolveMemberships = (ticket: any, existing: any): string[] => {
	if (ticket.memberships !== undefined) return sanitizeMembershipKeys(ticket.memberships)
	if (ticket.includesPremium !== undefined) return ticket.includesPremium ? (["premium"] as const).slice() : []
	return ticketMemberships(existing)
}

export const ticketsById = (tickets: any[] | undefined) => {
	const map = new Map<string, any>()
	;(tickets || []).forEach((t: any) => map.set(t._id?.toString(), t))
	return map
}

/**
 * Turns the client's tickets into what gets stored, preserving everything that must survive an
 * edit. **This is the only implementation** — `update.ts` and the inline tickets endpoint both
 * call it, because getting any of it subtly wrong costs real money:
 *
 *  - Each ticket's existing `_id` is kept (the client's `ticket.id` IS the previous
 *    `_id.toString()`). Bookings reference tickets by `_id`, so regenerating one silently
 *    orphans every past purchase's ticket-type link.
 *  - A new Stripe price is minted ONLY when the ticket is new or its price actually changed.
 *  - `requireApproval`, `memberships` and `membershipInterval` are preserve-on-omit: undefined
 *    means "leave it alone", so a stale form can't wipe a per-ticket override or move an annual
 *    ticket back to monthly, which would quietly change what the next buyer's card is charged.
 */
export async function resolveTickets(existingTickets: any[] | undefined, tickets: IncomingTicket[]) {
	const existingTicketById = ticketsById(existingTickets)

	return await Promise.all(
		tickets.map(async (ticket) => {
			const existing = existingTicketById.get(ticket.id?.toString())
			const priceChanged = !existing || Number(existing.price) !== ticket.price
			const stripeProductId = priceChanged
				? (
						await stripe.prices.create({
							// Math.round, not `* 100` alone: 19.99 * 100 is 1998.9999999999998 in floating
							// point, and Stripe rejects a non-integer unit_amount. Matches clone.ts.
							unit_amount: Math.round(ticket.price * 100),
							currency: "usd",
							product_data: { name: ticket.title },
						} as Stripe.PriceCreateParams)
				  ).id
				: existing.stripeProductId

			const resolvedRequireApproval =
				ticket.requireApproval !== undefined
					? ticket.requireApproval
					: existing?.requireApproval !== undefined
						? existing.requireApproval
						: undefined

			const resolvedMemberships = resolveMemberships(ticket, existing)

			const resolvedMembershipInterval =
				ticket.membershipInterval !== undefined
					? ticket.membershipInterval
					: existing?.membershipInterval !== undefined
						? existing.membershipInterval
						: undefined

			// Preserve-on-omit like the two above, then clamped through the shared resolver so a
			// hand-crafted 999 can't be stored and later quoted to a buyer as their free period.
			// `0` is stored as 0 rather than dropped: a host clearing the field is saying "no
			// months", which must overwrite the value that was there.
			const resolvedMembershipFreeMonths =
				ticket.membershipFreeMonths !== undefined
					? ticketMembershipFreeMonths({ membershipFreeMonths: ticket.membershipFreeMonths })
					: existing?.membershipFreeMonths !== undefined
						? ticketMembershipFreeMonths(existing)
						: undefined

			return {
				...(existing ? { _id: existing._id } : {}),
				name: ticket.title,
				desc: ticket.description,
				price: ticket.price.toFixed(2),
				stripeProductId,
				...(resolvedRequireApproval !== undefined ? { requireApproval: resolvedRequireApproval } : {}),
				memberships: resolvedMemberships,
				...(resolvedMembershipInterval !== undefined ? { membershipInterval: resolvedMembershipInterval } : {}),
				...(resolvedMembershipFreeMonths !== undefined ? { membershipFreeMonths: resolvedMembershipFreeMonths } : {}),
				// Written alongside the array purely so the mobile app and any older reader still
				// see a bundled Premium ticket. The array is the authority.
				includesPremium: resolvedMemberships.includes("premium"),
			}
		}),
	)
}
