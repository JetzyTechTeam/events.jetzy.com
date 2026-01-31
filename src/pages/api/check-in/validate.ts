import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { CheckIn } from "@/models/checkIn"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

/**
 * API endpoint to validate booking and check-in status
 * POST /api/check-in/validate
 * Body: { eventId: string, identifier: string (email or booking ref) }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()

	try {
		// Verify admin authentication
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
		}

		// @ts-ignore
		if (session.user?.role !== "admin") {
			return sendResponse(res, null, "Access denied. Admin only.", false, ResCode.FORBIDDEN)
		}

		const { eventId, identifier } = req.body

		if (!eventId || !identifier) {
			return sendResponse(res, null, "Event ID and email address are required", false, ResCode.BAD_REQUEST)
		}

		// Normalize email
		const normalizedEmail = identifier.trim().toLowerCase()

		// Search for ALL bookings by email for this event
		const bookings = await Bookings.find({
			eventId,
			isDeleted: false,
			customerEmail: { $regex: new RegExp(`^${normalizedEmail}$`, "i") },
		}).lean()

		if (!bookings || bookings.length === 0) {
			return sendResponse(res, null, "No booking found for this event with the provided email address", false, ResCode.NOT_FOUND)
		}

		// Aggregate data from all bookings
		let totalTickets = 0
		let totalCheckedIn = 0
		const allCheckInHistory: any[] = []
		const bookingRefs: string[] = []
		let customerName = bookings[0].customerName
		let customerPhone = bookings[0].customerPhone
		let firstCheckInAt: string | null = null
		let lastCheckInAt: string | null = null

		// Process each booking
		for (const booking of bookings) {
			bookingRefs.push(booking.bookingRef)

			// Calculate tickets for this booking
			const bookingTickets = booking.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
			totalTickets += bookingTickets

			// Check for existing check-in record for this booking
			const checkIn = await CheckIn.findOne({ bookingId: booking._id }).lean()

			if (checkIn) {
				totalCheckedIn += checkIn.checkedInCount || 0

				// Collect check-in history
				if (checkIn.checkInHistory && checkIn.checkInHistory.length > 0) {
					allCheckInHistory.push(...checkIn.checkInHistory)
				}

				// Track first and last check-in times
				if (checkIn.firstCheckInAt) {
					if (!firstCheckInAt || new Date(checkIn.firstCheckInAt) < new Date(firstCheckInAt)) {
						firstCheckInAt = checkIn.firstCheckInAt.toISOString()
					}
				}
				if (checkIn.lastCheckInAt) {
					if (!lastCheckInAt || new Date(checkIn.lastCheckInAt) > new Date(lastCheckInAt)) {
						lastCheckInAt = checkIn.lastCheckInAt.toISOString()
					}
				}
			}
		}

		// Sort check-in history by timestamp (most recent first)
		allCheckInHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

		const remainingTickets = totalTickets - totalCheckedIn
		const isFullyCheckedIn = remainingTickets === 0

		const responseData = {
			bookingId: bookings.map((b) => b._id.toString()).join(","), // Comma-separated booking IDs
			bookingRef: bookingRefs.join(", "), // Display all booking references
			customerName,
			customerEmail: normalizedEmail,
			customerPhone,
			totalTickets,
			checkedInCount: totalCheckedIn,
			remainingTickets,
			isFullyCheckedIn,
			firstCheckInAt,
			lastCheckInAt,
			checkInHistory: allCheckInHistory,
			bookingStatus: bookings[0].status, // Use first booking's status
			totalBookings: bookings.length, // Number of separate bookings
		}

		return sendResponse(res, responseData, `Found ${bookings.length} booking(s) for this email`, true, ResCode.OK)
	} catch (error: any) {
		console.error("Check-in validation error:", error)
		return sendResponse(res, null, error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
