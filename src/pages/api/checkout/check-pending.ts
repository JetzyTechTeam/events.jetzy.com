import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)

		if (!session || !session.user?.email) {
			return sendResponse(res, { hasPendingBookings: false }, "User not logged in", true, ResCode.OK)
		}

		const { eventId } = req.query

		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, { hasPendingBookings: false }, "Event ID is required", true, ResCode.BAD_REQUEST)
		}

		const { Events } = await import("@/models/events")
		const { Bookings } = await import("@/models/events/bookings")
		const { BookingStatus } = await import("@/models/events/types")

		const eventObjectId = new Types.ObjectId(eventId)
		const userEmail = session.user.email.toLowerCase()

		// Get event to check capacity
		const event = await Events.findById(eventId)
		if (!event) {
			return sendResponse(res, { hasPendingBookings: false }, "Event not found", true, ResCode.NOT_FOUND)
		}

		// No restrictions - users can buy tickets regardless of pending/confirmed bookings
		// This check is disabled to allow users to purchase tickets freely
		// Capacity restrictions are handled in the main checkout flow

		return sendResponse(res, { hasPendingBookings: false, hasExistingBooking: false }, "No pending bookings found", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error checking pending bookings:", error)
		return sendResponse(res, { hasPendingBookings: false }, error.message || "Failed to check pending bookings", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

