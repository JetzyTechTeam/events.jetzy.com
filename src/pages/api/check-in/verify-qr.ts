import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Bookings } from "@/models/events/bookings"
import { extractTokenFromQRPayload } from "@/lib/qr-generator"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Types } from "mongoose"
import { Events } from "@/models/events"
import { EventInvitation } from "@/models/events/event-invitations"
import { CheckIn } from "@/models/checkIn"
import { BookingStatus } from "@/models/events/types"

/**
 * POST /api/check-in/verify-qr
 * Verify a QR code token and return booking details
 * Admin only
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		// Verify admin authentication
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
		}

		// Verify admin access - QR scanning is admin only
		// @ts-ignore
		if (session.user?.role !== "admin" && session.user?.role !== "super admin") {
			return sendResponse(res, null, "Access denied. Admin only.", false, ResCode.FORBIDDEN)
		}

		const { qrPayload, eventId } = req.body

		// Validate inputs
		if (!qrPayload || !eventId) {
			return sendResponse(
				res,
				null,
				"QR payload and event ID are required",
				false,
				ResCode.BAD_REQUEST
			)
		}

		// Extract token from QR payload
		console.log("[verify-qr] Received QR payload:", qrPayload?.substring(0, 100) + (qrPayload?.length > 100 ? '...' : ''))
		const token = extractTokenFromQRPayload(qrPayload)
		console.log("[verify-qr] Extracted token:", token?.substring(0, 50) + ((token?.length || 0) > 50 ? '...' : ''))

		if (!token) {
			console.error("[verify-qr] Failed to extract token from payload:", qrPayload)
			return sendResponse(
				res,
				null,
				"Invalid QR code format. Expected format: JETZY:token",
				false,
				ResCode.BAD_REQUEST
			)
		}

		// Find booking by QR token and event ID
		console.log("[verify-qr] Searching for booking with token and eventId:", eventId)
		const booking = await Bookings.findOne({
			qrCodeToken: token,
			eventId: new Types.ObjectId(eventId),
			isDeleted: false,
		}).populate("eventId", "name location startsOn endsOn timezone")

		console.log("[verify-qr] Booking found:", booking ? `Yes (${booking.bookingRef})` : "No")

		// Get event details with full ticket information
		const event = await Events.findById(eventId).populate("tickets").populate("ownerId", "firstName lastName email phone")

		if (!booking) {
			return sendResponse(
				res,
				null,
				"Invalid QR code. Ticket not found or does not belong to this event.",
				false,
				ResCode.NOT_FOUND
			)
		}

		// Check if booking is cancelled - explicitly reject cancelled bookings
		if (booking.status === BookingStatus.CANCELLED) {
			return sendResponse(
				res,
				{
					booking: booking,
					message: "This booking has been cancelled. Cancelled tickets cannot be used for entry.",
				},
				"Booking is cancelled",
				false,
				ResCode.BAD_REQUEST
			)
		}

		// Check if booking is confirmed or already checked in
		if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.CHECKED_IN) {
			return sendResponse(
				res,
				{
					booking: booking,
					message: `Booking status is ${booking.status}. Only confirmed bookings can be checked in.`,
				},
				`Booking is ${booking.status.toLowerCase()}`,
				true,
				ResCode.OK
			)
		}

		// Check if booking is already fully checked in
		const checkInRecord = await CheckIn.findOne({ bookingId: booking._id }).lean()
		// Only consider fully checked in if all tickets are checked in
		const isAlreadyCheckedIn = checkInRecord && checkInRecord.isFullyCheckedIn === true
		
		// Calculate total tickets and get detailed ticket information
		const totalTickets = booking.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
		
		// Get check-in information if exists
		let checkedInCount = 0
		let remainingTickets = totalTickets
		let firstCheckInAt: string | null = null
		let lastCheckInAt: string | null = null
		let checkInHistory: any[] = []
		
		if (checkInRecord) {
			checkedInCount = checkInRecord.checkedInCount || 0
			remainingTickets = totalTickets - checkedInCount
			firstCheckInAt = checkInRecord.firstCheckInAt ? checkInRecord.firstCheckInAt.toISOString() : null
			lastCheckInAt = checkInRecord.lastCheckInAt ? checkInRecord.lastCheckInAt.toISOString() : null
			checkInHistory = checkInRecord.checkInHistory || []
		}
		
		// Get detailed ticket information
		const ticketDetails = booking.tickets.map((bookingTicket: any) => {
			const eventTicket = event?.tickets?.find((t: any) => t._id.toString() === bookingTicket.ticketId.toString())
			return {
				ticketId: bookingTicket.ticketId.toString(),
				name: eventTicket?.name || "Unknown Ticket",
				quantity: bookingTicket.quantity,
				price: eventTicket?.price || 0,
				description: eventTicket?.desc || "",
			}
		})

		// Get invited guests for this event (guests invited by any buyer for this event)
		// Note: We get all pending invitations for this event since there's no direct booking-guest link
		const invitedGuests = await EventInvitation.find({
			eventId: new Types.ObjectId(eventId),
			status: "pending",
		}).limit(50) // Limit to prevent too much data

		// Return comprehensive booking details
		return sendResponse(
			res,
			{
				bookingId: booking._id.toString(),
				bookingRef: booking.bookingRef,
				customerName: booking.customerName,
				customerEmail: booking.customerEmail,
				customerPhone: booking.customerPhone,
				totalTickets,
				tickets: ticketDetails,
				subTotal: booking.subTotal,
				total: booking.total,
				status: booking.status,
				isAlreadyCheckedIn,
				checkedInCount,
				remainingTickets,
				isFullyCheckedIn: isAlreadyCheckedIn && remainingTickets === 0,
				firstCheckInAt,
				lastCheckInAt,
				checkInHistory,
				referralCode: booking.referralCode || undefined,
				discountAmount: booking.discountAmount || undefined,
				event: {
					_id: event?._id.toString(),
					name: event?.name,
					location: event?.location,
					startsOn: event?.startsOn,
					endsOn: event?.endsOn,
					timezone: event?.timezone,
					owner: event?.ownerId
						? {
								name: `${(event.ownerId as any).firstName} ${(event.ownerId as any).lastName}`,
								email: (event.ownerId as any).email,
								phone: (event.ownerId as any).phone,
						  }
						: event?.host
						? {
								name: event.host.name,
								email: event.host.email,
								phone: event.host.phone,
						  }
						: undefined,
				},
				invitedGuests: invitedGuests.map((inv) => ({
					email: inv.email,
					name: inv.name || "",
					status: inv.status,
				})),
			},
			isAlreadyCheckedIn 
				? "This booking has already been checked in." 
				: "QR code verified successfully. Ready for check-in.",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[verify-qr] Error:", error)
		return sendResponse(
			res,
			null,
			"Internal server error",
			false,
			ResCode.INTERNAL_SERVER_ERROR
		)
	}
}
