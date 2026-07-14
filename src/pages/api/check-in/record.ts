import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { CheckIn } from "@/models/checkIn"
import { EventGuest } from "@/models/eventGuest"
import { Events } from "@/models/events"
import { isCancelledBooking, isPendingBooking } from "@/lib/booking-status"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

/**
 * API endpoint to record check-in
 * POST /api/check-in/record
 * Body: {
 *   bookingId: string,
 *   eventId: string,
 *   count: number,
 *   guestDetails?: Array<{ name: string, email: string, phone: string }>
 * }
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

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { bookingId, eventId, count, guestDetails } = req.body

		// Validate inputs
		if (!bookingId || !eventId || !count) {
			return sendResponse(res, null, "Booking ID, Event ID, and count are required", false, ResCode.BAD_REQUEST)
		}

		if (!isAdmin) {
			const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }, { ownerId: 1 }).lean()
			if (!event || (event as any).ownerId?.toString() !== userId) {
				return sendResponse(res, null, "Access denied. You can only check in guests for your own events.", false, ResCode.FORBIDDEN)
			}
		}

		if (count < 1) {
			return sendResponse(res, null, "Count must be at least 1", false, ResCode.BAD_REQUEST)
		}

		// Validate guest details if provided
		if (guestDetails && Array.isArray(guestDetails)) {
			for (const guest of guestDetails) {
				if (!guest.name || !guest.email || !guest.phone) {
					return sendResponse(res, null, "Each guest must have name, email, and phone", false, ResCode.BAD_REQUEST)
				}
			}
		}

		// Handle multiple booking IDs (comma-separated)
		const bookingIds = bookingId.split(",").map((id: string) => new Types.ObjectId(id.trim()))

		// Verify all bookings exist and gather data
		const foundBookings = await Bookings.find({
			_id: { $in: bookingIds },
			eventId: new Types.ObjectId(eventId),
			isDeleted: false,
		})

		if (!foundBookings || foundBookings.length === 0) {
			return sendResponse(res, null, "No bookings found or have been deleted", false, ResCode.NOT_FOUND)
		}

		// Safeguard: a cancelled/rejected or approval-pending booking can never be checked in.
		const bookings = foundBookings.filter((b) => !isCancelledBooking(b) && !isPendingBooking(b))
		if (bookings.length === 0) {
			return sendResponse(res, null, "Cannot check in a cancelled or pending booking.", false, ResCode.BAD_REQUEST)
		}

		// Calculate total tickets across all bookings
		let totalTickets = 0
		let totalCurrentlyCheckedIn = 0
		const bookingRefs: string[] = []

		for (const booking of bookings) {
			bookingRefs.push(booking.bookingRef)
			const bookingTickets = booking.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
			totalTickets += bookingTickets

			// Get current check-in count for this booking
			const existingCheckIn = await CheckIn.findOne({ bookingId: booking._id })
			if (existingCheckIn) {
				totalCurrentlyCheckedIn += existingCheckIn.checkedInCount
			}
		}

		// Validate against over-check-in
		const remainingTickets = totalTickets - totalCurrentlyCheckedIn
		if (count > remainingTickets) {
			return sendResponse(
				res,
				{
					totalTickets,
					currentCheckedIn: totalCurrentlyCheckedIn,
					remainingTickets,
					requestedCount: count,
				},
				`Cannot check in ${count} guests. Only ${remainingTickets} tickets remaining.`,
				false,
				ResCode.BAD_REQUEST,
			)
		}

		// Distribute check-ins across bookings (FIFO - first booking first)
		let remainingToCheckIn = count
		const checkInRecords: any[] = []

		for (const booking of bookings) {
			if (remainingToCheckIn <= 0) break

			const bookingTickets = booking.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)

			// Get or create check-in record for this booking
			let checkIn = await CheckIn.findOne({ bookingId: booking._id })

			if (!checkIn) {
				checkIn = new CheckIn({
					bookingId: booking._id,
					eventId: new Types.ObjectId(eventId),
					bookingRef: booking.bookingRef,
					customerEmail: booking.customerEmail,
					customerName: booking.customerName,
					totalTickets: bookingTickets,
					checkedInCount: 0,
					checkInHistory: [],
				})
			}

			// Calculate how many we can check in for this booking
			const availableForThisBooking = bookingTickets - checkIn.checkedInCount
			const toCheckInThisBooking = Math.min(remainingToCheckIn, availableForThisBooking)

			if (toCheckInThisBooking > 0) {
				// Update check-in record
				checkIn.checkedInCount += toCheckInThisBooking
				checkIn.isFullyCheckedIn = checkIn.checkedInCount >= bookingTickets

				// Add to check-in history
				checkIn.checkInHistory.push({
					count: toCheckInThisBooking,
					timestamp: new Date(),
					// @ts-ignore
					adminId: session.user?._id || "unknown",
					// @ts-ignore
					adminName: session.user?.fullName || session.user?.email || "Admin",
				})

				// Update timestamps
				if (!checkIn.firstCheckInAt) {
					checkIn.firstCheckInAt = new Date()
				}
				checkIn.lastCheckInAt = new Date()

				await checkIn.save()
				checkInRecords.push(checkIn)

				// Save guest details if provided
				if (guestDetails && Array.isArray(guestDetails) && guestDetails.length > 0) {
					// Save as many guest details as were checked in for this booking
					const guestsToSave = guestDetails.splice(0, toCheckInThisBooking)

					for (const guest of guestsToSave) {
						const eventGuest = new EventGuest({
							eventId: new Types.ObjectId(eventId),
							bookingId: booking._id,
							checkInId: checkIn._id,
							bookingEmail: booking.customerEmail,
							guestName: guest.name,
							guestEmail: guest.email,
							guestPhone: guest.phone,
							checkedInAt: new Date(),
							// @ts-ignore
							checkedInBy: session.user?.fullName || session.user?.email || "Admin",
						})
						await eventGuest.save()
					}
				}

				remainingToCheckIn -= toCheckInThisBooking
			}
		}

		// Recalculate totals after check-in
		let newTotalCheckedIn = 0
		const allCheckInHistory: any[] = []
		let firstCheckInAt: string | null = null
		let lastCheckInAt: string | null = null

		for (const booking of bookings) {
			const checkIn = await CheckIn.findOne({ bookingId: booking._id }).lean()
			if (checkIn) {
				newTotalCheckedIn += checkIn.checkedInCount

				if (checkIn.checkInHistory) {
					allCheckInHistory.push(...checkIn.checkInHistory)
				}

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

		const responseData = {
			bookingId: bookingIds.map((id: Types.ObjectId) => id.toString()).join(","),
			bookingRef: bookingRefs.join(", "),
			customerName: bookings[0].customerName,
			customerEmail: bookings[0].customerEmail,
			customerPhone: bookings[0].customerPhone,
			totalTickets,
			checkedInCount: newTotalCheckedIn,
			remainingTickets: totalTickets - newTotalCheckedIn,
			isFullyCheckedIn: newTotalCheckedIn >= totalTickets,
			firstCheckInAt,
			lastCheckInAt,
			checkInHistory: allCheckInHistory,
		}

		return sendResponse(res, responseData, `Successfully checked in ${count} guest${count > 1 ? "s" : ""}`, true, ResCode.OK)
	} catch (error: any) {
		console.error("Check-in record error:", error)
		return sendResponse(res, null, error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
