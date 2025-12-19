import { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { EventInvitation } from "@/models/events/event-invitations"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[bookings/[bookingId]/invited-guests] Database not connected, attempting to connect...")
			await dbconn.asPromise()
		}

		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to perform this action.", false, ResCode.UNAUTHORIZED)
		}

		const { bookingId } = req.query

		if (!bookingId) {
			return sendResponse(res, null, "Booking ID is required", false, ResCode.BAD_REQUEST)
		}

		// Find the booking
		const booking = await Bookings.findById(bookingId)
		if (!booking) {
			return sendResponse(res, null, "Booking not found", false, ResCode.NOT_FOUND)
		}

		// Get invited guests for this booking (guests invited by this customer for this event)
		const customerEmailLower = booking.customerEmail.toLowerCase()
		let invitedGuests = await EventInvitation.find({
			eventId: booking.eventId,
			customerEmail: customerEmailLower,
		}).limit(50).lean()

		// If no guests found with customerEmail, try time-based fallback for old bookings
		if (invitedGuests.length === 0) {
			const bookingCreatedAt = booking.createdAt || new Date()
			const fiveMinutesBefore = new Date(bookingCreatedAt.getTime() - 5 * 60 * 1000)
			const fiveMinutesAfter = new Date(bookingCreatedAt.getTime() + 5 * 60 * 1000)
			
			invitedGuests = await EventInvitation.find({
				eventId: booking.eventId,
				$or: [
					{ customerEmail: { $exists: false } },
					{ customerEmail: null }
				],
				invitedAt: { $gte: fiveMinutesBefore, $lte: fiveMinutesAfter }
			}).limit(50).lean()
		}

		const formattedGuests = invitedGuests.map((inv) => ({
			email: inv.email,
			name: inv.name || "",
			status: inv.status,
			invitedAt: inv.invitedAt,
		}))

		return sendResponse(res, formattedGuests, "Invited guests retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error fetching invited guests:", error)
		return sendResponse(res, null, `Failed to fetch invited guests: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
