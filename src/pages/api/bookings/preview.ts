import { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { bookingMoneyAmount, bookingMoneyState, canGuestCancel } from "@/lib/booking-cancellation"

/**
 * Minimal, unauthenticated summary of a booking, keyed by its reference.
 *
 * The cancel link in a confirmation email has to work for guests who never made an account,
 * so `bookingRef` acts as a bearer token here exactly as it already does in
 * `api/bookings/cancel`. Because of that this endpoint returns the bare minimum needed to
 * render a confirm screen — event name, what was booked, and where the money sits.
 *
 * Deliberately NOT returned: customer email, phone, custom answers, Stripe identifiers.
 * Someone holding a leaked reference must not be able to harvest the booker's details.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()

	try {
		const bookingRef = (req.query.bookingRef as string)?.trim()
		if (!bookingRef) {
			return sendResponse(res, null, "Booking reference is required", false, ResCode.BAD_REQUEST)
		}

		const booking = await Bookings.findOne({ bookingRef, isDeleted: false }).lean<any>()
		if (!booking) {
			return sendResponse(res, null, "Booking not found", false, ResCode.NOT_FOUND)
		}

		const event = await Events.findById(booking.eventId, "_id name slug startsOn timezone hasStartTime").lean<any>()
		const eligibility = canGuestCancel(booking, event)

		return sendResponse(
			res,
			{
				bookingRef: booking.bookingRef,
				status: booking.status,
				ticketCount: (booking.tickets || []).reduce((sum: number, t: any) => sum + (Number(t.quantity) || 0), 0),
				moneyState: bookingMoneyState(booking),
				moneyAmount: bookingMoneyAmount(booking),
				canCancel: eligibility.allowed,
				cancelBlockedReason: eligibility.reason,
				event: event ? { name: event.name, slug: event.slug, startsOn: event.startsOn, timezone: event.timezone } : null,
			},
			"OK",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[bookings/preview] Failed:", error)
		return sendResponse(res, null, `Failed to load booking: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
