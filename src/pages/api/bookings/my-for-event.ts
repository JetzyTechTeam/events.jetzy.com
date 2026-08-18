import { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { ensureDbConnected } from "@/configs/database"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { BookingStatus } from "@/models/events/types"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"
import { Events } from "@/models/events"
import { buildBookerMatchClauses } from "@/lib/booking-identity"
import { bookingMoneyAmount, bookingMoneyState, canGuestCancel } from "@/lib/booking-cancellation"
import { isPendingBooking } from "@/lib/booking-status"
import { resolveGuestLocation } from "@/lib/event-location"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Not authenticated", false, ResCode.UNAUTHORIZED)
		}

		const eventId = req.query.eventId as string
		if (!eventId || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid eventId is required", false, ResCode.BAD_REQUEST)
		}

		const orClauses = buildBookerMatchClauses(session)
		if (orClauses.length === 0) {
			return sendResponse(res, null, "No identity to match", false, ResCode.BAD_REQUEST)
		}

		const booking = await Bookings.findOne(
			{
				eventId: new Types.ObjectId(eventId),
				isDeleted: false,
				// REJECTED and FAILED (expired hold) are just as dead as CANCELLED — returning
				// them made the event page offer to "cancel" a booking that no longer existed.
				status: { $nin: [BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.FAILED] },
				$or: orClauses,
			},
			{ "payment.paymentIntentId": 0, "payment.checkoutSessionId": 0 },
		).lean()

		if (!booking) return sendResponse(res, null, "OK", true, ResCode.OK)

		// The event page needs to know whether to offer a Cancel button and what warning to
		// show with it, so resolve both here rather than re-deriving them in the browser.
		const event = await Events.findById(eventId, "startsOn location venueName locationDisclosedAfterBooking").lean<any>()
		const eligibility = canGuestCancel(booking as any, event)

		// The address, for an event that withholds it until someone registers. This caller HAS
		// registered — `buildBookerMatchClauses` matched their session or their booking email —
		// so they are entitled to it, and returning it here is what lets the event page show the
		// real location straight after a booking rather than only on the next full load.
		//
		// Still withheld while the booking is PENDING: awaiting the host's approval is not the
		// same as being approved.
		const eventLocation = isPendingBooking(booking as any) ? undefined : resolveGuestLocation(event)

		return sendResponse(
			res,
			{
				...booking,
				...(eventLocation ? { eventLocation } : {}),
				moneyState: bookingMoneyState(booking as any),
				moneyAmount: bookingMoneyAmount(booking as any),
				canCancel: eligibility.allowed,
				cancelBlockedReason: eligibility.reason,
			},
			"OK",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("Error fetching user booking:", error)
		return sendResponse(res, null, `Failed: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
