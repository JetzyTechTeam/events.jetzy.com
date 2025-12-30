import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)

		if (!session || !session.user?.email) {
			return sendResponse(res, null, "You need to be logged in to view your bookings", false, ResCode.UNAUTHORIZED)
		}

		const userEmail = session.user.email

		// Find all bookings for this user
		const bookings = await Bookings.find({
			customerEmail: userEmail,
			isDeleted: false,
		})
			.sort({ createdAt: -1 })
			.lean()

		// Get event IDs and fetch event details
		const eventIds = [...new Set(bookings.map((booking) => booking.eventId.toString()))]
		
		const events = await Events.find({
			_id: { $in: eventIds },
			isDeleted: false,
		})
			.lean()

		// Map bookings with event details and ticket tokens
		const bookingsWithEvents = bookings.map((booking) => {
			const event = events.find((e) => e._id.toString() === booking.eventId.toString())
			return {
				bookingRef: booking.bookingRef,
				eventId: booking.eventId.toString(),
				eventName: event?.name || "Unknown Event",
				eventSlug: event?.slug || "",
				qrCodeToken: booking.qrCodeToken || null,
				total: booking.total,
				status: booking.status,
				createdAt: booking.createdAt,
				tickets: booking.tickets || [],
			}
		})

		return sendResponse(
			res,
			{ bookings: bookingsWithEvents },
			"Bookings retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error fetching user bookings:", error)
		return sendResponse(
			res,
			null,
			error.message || "Failed to retrieve bookings",
			false,
			ResCode.INTERNAL_SERVER_ERROR
		)
	}
}

