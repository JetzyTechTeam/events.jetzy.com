import { Types } from "mongoose"
import { PREMIUM_TICKET_LIMIT_PER_EVENT, eventHasAnyPremiumTicket, ticketMembershipsById } from "@/lib/premium-bundle"
import { MEMBERSHIP_KEYS, type MembershipKey } from "@/lib/memberships"
import { BookingStatus } from "@/models/events/types"

/**
 * "How many membership tickets has this address already bought for this event?"
 *
 * The per-order cap alone is trivially bypassed by placing the order twice, so the real limit
 * has to be counted across every booking this person holds for the event. Keyed on the
 * CHECKOUT EMAIL, the same authority `heldMemberships` uses — see `premium-eligibility.ts`.
 *
 * Counted PER PRODUCT. A shared counter would mean two Jetzy Premium tickets exhaust the
 * buyer's Full Concierge allowance for the same event, which is a limit nobody agreed to.
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

export type MembershipAllowances = Record<MembershipKey, PremiumAllowance>

const emptyAllowances = (): MembershipAllowances =>
	MEMBERSHIP_KEYS.reduce((acc, key) => {
		acc[key] = { limit: PREMIUM_TICKET_LIMIT_PER_EVENT, used: 0, remaining: PREMIUM_TICKET_LIMIT_PER_EVENT }
		return acc
	}, {} as MembershipAllowances)

export async function getMembershipTicketAllowances(eventId: string, email: string): Promise<MembershipAllowances> {
	const allowances = emptyAllowances()
	const trimmed = typeof email === "string" ? email.trim() : ""

	if (!trimmed || !eventId || !Types.ObjectId.isValid(eventId)) return allowances

	const { Events } = await import("@/models/events")
	const { Bookings } = await import("@/models/events/bookings")

	const event = await Events.findById(eventId).select("tickets._id tickets.includesPremium tickets.memberships").lean()
	if (!event) return allowances

	// Nothing on this event sells a membership — no allowance to consume, and no reason to
	// touch the bookings collection.
	if (!eventHasAnyPremiumTicket(event as any)) return allowances

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

	bookings.forEach((booking: any) => {
		;(booking?.tickets || []).forEach((row: any) => {
			// `ticketId` points at a SUBDOCUMENT of `event.tickets`, not another collection,
			// so there is nothing to populate — resolve it in memory.
			const keys = ticketMembershipsById(event as any, String(row?.ticketId))
			const quantity = Number(row?.quantity) || 0
			if (!quantity) return
			keys.forEach((key) => {
				allowances[key].used += quantity
			})
		})
	})

	MEMBERSHIP_KEYS.forEach((key) => {
		allowances[key].remaining = Math.max(0, allowances[key].limit - allowances[key].used)
	})

	return allowances
}

/** @deprecated Premium-only shim. Use `getMembershipTicketAllowances`. */
export async function getPremiumTicketAllowance(eventId: string, email: string): Promise<PremiumAllowance> {
	return (await getMembershipTicketAllowances(eventId, email)).premium
}
