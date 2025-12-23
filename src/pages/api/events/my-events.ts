import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import mongoose from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		if (req.method !== "GET") {
			return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
		}

		// Check if user is authenticated
		const session = await getServerSession(req, res, authOptions)
		if (!session || !session.user?.email) {
			return sendResponse(res, null, "You must be logged in to view your events", false, ResCode.UNAUTHORIZED)
		}

		const userEmail = session.user.email

		// Get pagination parameters
		const limit = req.query.limit ? parseInt(req.query.limit as string) : 20
		const page = req.query.page ? parseInt(req.query.page as string) : 1
		const skip = (page - 1) * limit

		// Find all bookings for this user
		const bookings = await Bookings.find({
			customerEmail: userEmail,
			isDeleted: false,
		})
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean()

		// Get unique event IDs from bookings
		const eventIds = [...new Set(bookings.map((booking) => booking.eventId.toString()))].map(
			(id) => new mongoose.Types.ObjectId(id)
		)

		// Fetch event details for these events
		const events = await Events.find({
			_id: { $in: eventIds },
			isDeleted: false,
		})
			.sort({ startsOn: 1 })
			.lean()

		// Map events with booking information
		const eventsWithBookings = events.map((event) => {
			const eventBookings = bookings.filter((booking) => booking.eventId.toString() === event._id.toString())
			return {
				...event,
				bookings: eventBookings,
				totalTickets: eventBookings.reduce((sum, booking) => {
					return sum + booking.tickets.reduce((ticketSum, ticket) => ticketSum + ticket.quantity, 0)
				}, 0),
			}
		})

		// Get total count
		const totalBookings = await Bookings.countDocuments({
			customerEmail: userEmail,
			isDeleted: false,
		})

		const totalEvents = new Set(bookings.map((b) => b.eventId.toString())).size
		const totalPages = Math.ceil(totalEvents / limit)

		const pagination = {
			total: totalEvents,
			totalPages,
			page,
			showing: eventsWithBookings.length,
			limit,
		}

		return sendResponse(res, { events: eventsWithBookings, pagination }, "User events retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.error("[my-events] Error:", error)
		return sendResponse(res, null, error.message || "Failed to retrieve user events", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
