import { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { EventTracker } from "@/models/events/event-tracker"
import { Events } from "@/models/events"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { BookingStatus } from "@/models/events/types"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { sendBookingCancellation } from "@/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to perform this action.", false, ResCode.UNAUTHORIZED)
		}

		const { bookingId } = req.query

		if (!bookingId) {
			return sendResponse(res, null, "Booking ID is required", false, ResCode.BAD_REQUEST)
		}

		// Find the booking by ID
		const booking = await Bookings.findById(bookingId)

		if (!booking) {
			return sendResponse(res, null, "Booking not found", false, ResCode.NOT_FOUND)
		}

		// Check if booking is already cancelled
		if (booking.status === BookingStatus.CANCELLED) {
			return sendResponse(res, null, "Booking is already cancelled", false, ResCode.BAD_REQUEST)
		}

		// Update booking status to cancelled
		await Bookings.findByIdAndUpdate(booking._id, { 
			status: BookingStatus.CANCELLED 
		})

		// Update event tracker to free up the tickets
		const eventTracker = await EventTracker.findOne({ eventId: booking.eventId })
		if (eventTracker) {
			// Calculate total tickets to free up
			const totalTicketsToFree = booking.tickets.reduce((acc, ticket) => acc + ticket.quantity, 0)
			eventTracker.bookedTickets = Math.max(0, eventTracker.bookedTickets - totalTicketsToFree)
			await eventTracker.save()
		}

		// Get event details for email
		const event = await Events.findById(booking.eventId)
		if (event) {
			try {
				// Get ticket details from event
				const ticketDetails = booking.tickets.map((bookingTicket) => {
					const eventTicket = event.tickets.find((t: any) => t._id.toString() === bookingTicket.ticketId.toString())
					return {
						name: eventTicket?.name || "Unknown Ticket",
						price: parseFloat(eventTicket?.price || "0"),
						quantity: bookingTicket.quantity,
						desc: eventTicket?.desc || "",
					}
				})

				// Parse customer name (assuming format "FirstName LastName")
				const nameParts = booking.customerName.split(" ")
				const firstName = nameParts[0] || ""
				const lastName = nameParts.slice(1).join(" ") || ""

				// Send cancellation email
				await sendBookingCancellation({
					event: {
						name: event.name,
						location: event.location,
						startsOn: event.startsOn,
						endsOn: event.endsOn,
						timezone: event.timezone,
					} as any,
					firstName,
					lastName,
					email: booking.customerEmail,
					phone: booking.customerPhone,
					tickets: ticketDetails,
					orderNumber: booking.bookingRef,
					totalAmount: booking.total,
				})
			} catch (emailError: any) {
				console.error("Error sending cancellation email:", emailError)
				// Don't fail the cancellation if email fails, just log it
			}
		}

		// Get updated booking for response
		const updatedBooking = await Bookings.findById(booking._id)

		return sendResponse(res, updatedBooking, "Booking cancelled successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error cancelling booking:", error)
		return sendResponse(res, null, `Failed to cancel booking: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
