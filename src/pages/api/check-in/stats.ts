import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { CheckIn } from "@/models/checkIn"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { bookingTicketTotal, liveCheckInBookingsFilter } from "@/lib/check-in-bookings"
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

	await ensureDbConnected()

	try {
		// Verify admin authentication
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query

		if (!eventId) {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		if (!isAdmin) {
			const event = await Events.findOne({ _id: new Types.ObjectId(eventId as string), isDeleted: false }, { ownerId: 1 }).lean()
			if (!event || (event as any).ownerId?.toString() !== userId) {
				return sendResponse(res, null, "Access denied. You can only view stats for your own events.", false, ResCode.FORBIDDEN)
			}
		}

		if (typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Invalid event ID", false, ResCode.BAD_REQUEST)
		}

		// Every booking the door accepts — the same population `/api/check-in/list` shows, so a
		// tile and the list behind it always agree.
		const bookings = await Bookings.find(liveCheckInBookingsFilter(eventId)).select("_id tickets").lean()

		// Check-ins for THOSE bookings only: one left on a booking later cancelled must not count.
		const checkIns = await CheckIn.find({ bookingId: { $in: bookings.map((b) => b._id) } }).lean()

		// Create a map of check-ins by bookingId for quick lookup
		const checkInMap = new Map(checkIns.map((ci) => [ci.bookingId.toString(), ci]))

		// Calculate total tickets from bookings
		const totalTicketsBooked = bookings.reduce((sum, booking) => sum + bookingTicketTotal(booking as any), 0)

		// Calculate checked-in guests
		const totalGuestsCheckedIn = checkIns.reduce((sum, ci) => sum + ci.checkedInCount, 0)

		// Per booking, never below zero — the same sum as the list's "Not checked in" rows.
		const remainingGuests = bookings.reduce((sum, booking) => {
			const checkedIn = checkInMap.get(booking._id.toString())?.checkedInCount || 0
			return sum + Math.max(0, bookingTicketTotal(booking as any) - checkedIn)
		}, 0)

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
			remainingGuests,
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
