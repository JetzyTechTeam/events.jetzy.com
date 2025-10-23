import { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { EventTracker } from "@/models/events/event-tracker"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { BookingStatus } from "@/models/events/types"
import mongoose from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const { bookingRef } = req.body

		if (!bookingRef) {
			return sendResponse(res, null, "Booking reference is required", false, ResCode.BAD_REQUEST)
		}

		// Find the booking by reference
		const booking = await Bookings.findOne({ bookingRef })

		if (!booking) {
			return sendResponse(res, null, "Booking not found", false, ResCode.NOT_FOUND)
		}

		// Check if booking is already cancelled
		if (booking.status === BookingStatus.CANCELLED) {
			return sendResponse(res, null, "Booking is already cancelled", false, ResCode.BAD_REQUEST)
		}

		// Check if booking can be cancelled (not confirmed or already processed)
		if (booking.status === BookingStatus.CONFIRMED) {
			return sendResponse(res, null, "Cannot cancel confirmed booking. Please contact support.", false, ResCode.BAD_REQUEST)
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

		// Get updated booking for response
		const updatedBooking = await Bookings.findById(booking._id)

		return sendResponse(res, updatedBooking, "Booking cancelled successfully", true, ResCode.OK) true, ResCode.OK)
	} catch (error: any) {
		console.error("Error cancelling booking:", error)
		return sendResponse(res, null, `Failed to cancel booking: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
