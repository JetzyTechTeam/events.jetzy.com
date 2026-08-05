import { Types } from "mongoose"
import { PREMIUM_TICKET_LIMIT_PER_EVENT, ticketIncludesPremiumById } from "@/lib/premium-bundle"
import { BookingStatus } from "@/models/events/types"

/**
 * "How many Jetzy Premium tickets has this address already bought for this event?"
 *
 * The per-order cap alone is trivially bypassed by placing the order twice, so the real limit
 * has to be counted across every booking this person holds for the event. Keyed on the
 * CHECKOUT EMAIL, the same authority `isPremiumEmail` uses — see `premium-eligibility.ts`.
 *
 * SERVER ONLY: reads the Bookings and Events collections.
 */

/** Escape a user-supplied string for safe use inside a RegExp literal. */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Bookings that never resulted in a ticket, and so shouldn't consume the allowance.
 *
 * Deliberately NOT `isCancelledBooking`, which also lumps in CANCELLED. A cancelled bundled
 * booking DOES count: there is no refund, and cancelling a ticket never cancels the
 * membership it started — the buyer kept both. Freeing the slot would make buy-cancel-repeat
 * a way straight through the cap.
 *
 * FAILED and REJECTED are different: no money was taken and no membership began.
 */
const NON_CONSUMING_STATUSES = [BookingStatus.FAILED, BookingStatus.REJECTED]

export type PremiumAllowance = {
	limit: number
	used: number
	remaining: number
}

export async function getPremiumTicketAllowance(eventId: string, email: string): Promise<PremiumAllowance> {
	const limit = PREMIUM_TICKET_LIMIT_PER_EVENT
	const trimmed = typeof email === "string" ? email.trim() : ""

	if (!trimmed || !eventId || !Types.ObjectId.isValid(eventId)) {
		return { limit, used: 0, remaining: limit }
	}

	const { Events } = await import("@/models/events")
	const { Bookings } = await import("@/models/events/bookings")

	const event = await Events.findById(eventId).select("tickets._id tickets.includesPremium").lean()
	if (!event) return { limit, used: 0, remaining: limit }

	// Nothing on this event sells a membership — no allowance to consume, and no reason to
	// touch the bookings collection.
	const hasPremiumTicket = (event as any).tickets?.some((t: any) => t?.includesPremium)
	if (!hasPremiumTicket) return { limit, used: 0, remaining: limit }

	// Case-insensitive by necessity: `customerEmail` has no `lowercase: true`, so a booking
	// made as `Fahad@Example.com` is invisible to an exact match on the lowercased address.
	// Same trap `booking-identity.ts` exists to document.
	//
	// Only the email is matched — NOT `bookerUserId`. Using `buildBookerMatchClauses` here
	// would pull in a logged-in buyer's bookings made under *other* addresses, so one person's
	// two accounts would share a single allowance.
	const bookings = await Bookings.find({
		eventId: new Types.ObjectId(eventId),
		customerEmail: { $regex: `^${escapeRegex(trimmed)}$`, $options: "i" },
		isDeleted: false,
		status: { $nin: NON_CONSUMING_STATUSES },
	})
		.select("tickets")
		.lean()

	const used = bookings.reduce((total: number, booking: any) => {
		const rows = booking?.tickets || []
		return (
			total +
			rows.reduce((sum: number, row: any) => {
				// `ticketId` points at a SUBDOCUMENT of `event.tickets`, not another collection,
				// so there is nothing to populate — resolve it in memory.
				if (!ticketIncludesPremiumById(event as any, String(row?.ticketId))) return sum
				return sum + (Number(row?.quantity) || 0)
			}, 0)
		)
	}, 0)

	return { limit, used, remaining: Math.max(0, limit - used) }
}
