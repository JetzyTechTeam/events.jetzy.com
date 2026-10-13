import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { isCancelledBooking } from "@/lib/booking-status"
import { bookingMoneyState, NON_REFUNDABLE_MESSAGE } from "@/lib/booking-cancellation"
import { sessionIsAdmin, sessionUserId } from "@/lib/booking-identity"
import { freeTicketEditRefusal } from "@/lib/booking-request-edit"
import { verifyAvailability } from "@/lib/ticket-availability"
import { adjustBookedTickets, bookingConsumedCapacity } from "@/lib/event-tracker-sync"
import { Types } from "mongoose"
import zod from "zod"

/**
 * A host or admin corrects how many tickets a booking is for.
 *
 * **FREE BOOKINGS ONLY.** Jetzy issues no refunds, so lowering a quantity on a booking that was
 * actually paid for would take a seat back and keep the money, and raising one would hand over a
 * ticket nobody paid for. Until that decision is made, a paid booking is refused outright here
 * and the Edit control is not offered for it in the console. Cancel is unchanged and still works
 * on any booking (`api/bookings/cancel.ts`).
 *
 * This is the only endpoint in the codebase that mutates a booking's CONTENTS after creation —
 * everything else is a status or payment transition — which is why it is narrow on purpose:
 * only the quantities of tickets already on the booking may change. Adding a ticket type would
 * drag in pricing, approval resolution and membership bundling, none of which can be settled
 * without a payment step.
 */

const schema = zod.object({
	bookingRef: zod.string().nonempty(),
	tickets: zod
		.array(
			zod.object({
				ticketId: zod.string().nonempty(),
				// `0` removes the row. An empty booking is refused below — that is what Cancel is for.
				quantity: zod.number().int().min(0).max(1000),
			}),
		)
		.nonempty("Send at least one ticket row."),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()

	// Session required, with no bearer-token path. Unlike `cancel.ts`, which a guest reaches
	// from an emailed link, this is a host tool and a guest has no business editing a headcount.
	const session = await getServerSession(req, res, authOptions)
	const userId = sessionUserId(session)
	if (!userId) return sendResponse(res, null, "Not authenticated.", false, ResCode.UNAUTHORIZED)
	const isAdmin = sessionIsAdmin(session)

	const parsed = schema.safeParse(req.body)
	if (!parsed.success) {
		return sendResponse(res, null, parsed.error.errors[0]?.message || "Invalid input.", false, ResCode.BAD_REQUEST)
	}
	const { bookingRef, tickets: incoming } = parsed.data

	const booking = await Bookings.findOne({ bookingRef })
	if (!booking || (booking as any).isDeleted === true) {
		return sendResponse(res, null, "Booking not found.", false, ResCode.NOT_FOUND)
	}

	const event = await Events.findById(booking.eventId)
	if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)

	if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
		return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
	}

	if (isCancelledBooking(booking as any)) {
		return sendResponse(res, null, "This booking is no longer active.", false, ResCode.BAD_REQUEST)
	}

	// THE LINE. `hold`, `captured`, `released` and `unknown` are all refused — `unknown`
	// especially, because it means a priced booking with no payment record and we must never
	// treat one of those as free (238 such rows exist in production).
	const moneyState = bookingMoneyState(booking as any)
	if (moneyState !== "free") {
		return sendResponse(
			res,
			{ moneyState },
			`Paid bookings can't be edited yet. ${NON_REFUNDABLE_MESSAGE} Cancel the booking and ask the guest to rebook instead.`,
			false,
			ResCode.BAD_REQUEST,
		)
	}

	// Only rows already on the booking, and every one of them; at least one ticket left; and no
	// row growing on a ticket that is now priced or now sells a membership. The three checks
	// live in `booking-request-edit.ts` because the Approvals tab's request editor enforces the
	// same ones on a free request.
	const refusal = freeTicketEditRefusal(booking.tickets as any, incoming, event.tickets as any)
	if (refusal) return sendResponse(res, null, refusal, false, ResCode.BAD_REQUEST)

	const newTotal = incoming.reduce((sum, t) => sum + t.quantity, 0)

	const oldTotal = (booking.tickets || []).reduce((sum: number, t: any) => sum + (Number(t.quantity) || 0), 0)
	const delta = newTotal - oldTotal

	// Capacity, but only when seats are being ADDED — freeing them can never fail. The whole
	// new selection is checked with THIS booking excluded from the count, so the host isn't
	// blocked by the seats the booking already holds.
	if (delta > 0) {
		const verdict = await verifyAvailability(
			event,
			incoming.map((t) => ({ id: String(t.ticketId), quantity: t.quantity })),
			String(booking._id),
		)
		if (!verdict.ok) {
			return sendResponse(res, null, verdict.reason, false, ResCode.BAD_REQUEST)
		}
	}

	// Don't let a host cut the booking below the people who have already walked in.
	try {
		const { CheckIn } = await import("@/models/checkIn")
		const checkIn: any = await CheckIn.findOne({ bookingId: booking._id })
		const checkedIn = Number(checkIn?.checkedInCount) || 0
		if (checkedIn > newTotal) {
			return sendResponse(
				res,
				null,
				`${checkedIn} ${checkedIn === 1 ? "guest has" : "guests have"} already checked in on this booking, so it can't be reduced to ${newTotal}.`,
				false,
				ResCode.BAD_REQUEST,
			)
		}
	} catch (checkInError: any) {
		// A check-in lookup failure must not block a correction the host needs to make.
		console.error("[bookings/update-tickets] Check-in lookup failed:", checkInError?.message || checkInError)
	}

	const before = (booking.tickets || []).map((t: any) => ({ ticketId: t.ticketId, quantity: Number(t.quantity) || 0 }))
	const after = incoming
		.filter((t) => t.quantity > 0)
		.map((t) => ({ ticketId: new Types.ObjectId(String(t.ticketId)), quantity: t.quantity }))

	const editedBy: "host" | "admin" = isAdmin ? "admin" : "host"
	const editedAt = new Date()

	// `total`, `subTotal`, `discountAmount` and `referralCode` are deliberately NOT recomputed.
	// No money moved. On a genuinely free booking recomputation is a no-op, and on an order a
	// referral code discounted to $0 it would rewrite the historical subtotal that
	// `discountAmount` was derived against — silently changing what the growth report says that
	// code achieved. A headcount correction is not a sale.
	await Bookings.findByIdAndUpdate(booking._id, {
		$set: { tickets: after, ticketsEditedAt: editedAt, ticketsEditedBy: editedBy },
		$push: {
			ticketsEditHistory: {
				at: editedAt,
				by: editedBy,
				byUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
				from: before,
				to: after,
			},
		},
	})

	// Mirror the change onto the counter the mobile app reads — by the DELTA, and only when
	// this booking ever incremented it. `booking.updateEventTracker()` is additive-only and
	// would double-count here.
	if (bookingConsumedCapacity(booking as any)) {
		await adjustBookedTickets(booking.eventId, delta)
	}

	const updated = await Bookings.findById(booking._id).select("-payment.paymentIntentId -payment.checkoutSessionId")

	return sendResponse(
		res,
		{ bookingRef, tickets: updated?.tickets, ticketCount: newTotal, previousTicketCount: oldTotal },
		`Booking updated to ${newTotal} ${newTotal === 1 ? "ticket" : "tickets"}.`,
		true,
		ResCode.OK,
	)
}
