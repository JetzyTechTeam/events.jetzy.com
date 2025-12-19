import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { CheckIn } from "@/models/checkIn"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

/**
 * API endpoint to get check-in statistics for an event
 * GET /api/check-in/stats?eventId=xxx
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		// Verify admin authentication
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
		}

		// Verify admin access - Check-in stats is admin only
		// @ts-ignore
		if (session.user?.role !== "admin" && session.user?.role !== "super admin") {
			return sendResponse(res, null, "Access denied. Admin only.", false, ResCode.FORBIDDEN)
		}

		const { eventId } = req.query

		if (!eventId) {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		// Get all confirmed bookings for the event
		const bookings = await Bookings.find({
			eventId: new Types.ObjectId(eventId as string),
			status: BookingStatus.CONFIRMED,
			isDeleted: false,
		}).lean()

		// Get all check-ins for the event
		const checkIns = await CheckIn.find({ eventId: new Types.ObjectId(eventId as string) }).lean()

		// Create a map of check-ins by bookingId for quick lookup
		const checkInMap = new Map(checkIns.map((ci) => [ci.bookingId.toString(), ci]))

		// Calculate total tickets from bookings
		const totalTicketsBooked = bookings.reduce((sum, booking) => {
			const ticketCount = booking.tickets.reduce((acc, ticket) => acc + ticket.quantity, 0)
			return sum + ticketCount
		}, 0)

		// Calculate checked-in guests
		const totalGuestsCheckedIn = checkIns.reduce((sum, ci) => sum + ci.checkedInCount, 0)

		// Count bookings by check-in status
		let fullyCheckedInBookings = 0
		let partiallyCheckedInBookings = 0
		let notCheckedInBookings = 0

		bookings.forEach((booking) => {
			const checkIn = checkInMap.get(booking._id.toString())
			if (checkIn) {
				if (checkIn.isFullyCheckedIn) {
					fullyCheckedInBookings++
				} else if (checkIn.checkedInCount > 0) {
					partiallyCheckedInBookings++
				} else {
					notCheckedInBookings++
				}
			} else {
				notCheckedInBookings++
			}
		})

		const stats = {
			totalBookings: bookings.length,
			totalTicketsBooked,
			totalGuestsCheckedIn,
			remainingGuests: totalTicketsBooked - totalGuestsCheckedIn,
			fullyCheckedInBookings,
			partiallyCheckedInBookings,
			notCheckedInBookings,
			checkInPercentage: totalTicketsBooked > 0 ? ((totalGuestsCheckedIn / totalTicketsBooked) * 100).toFixed(2) : "0.00",
		}

		return sendResponse(res, stats, "Check-in statistics retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Check-in stats error:", error)
		return sendResponse(res, null, error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
