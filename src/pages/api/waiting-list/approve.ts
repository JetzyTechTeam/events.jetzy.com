import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { EventTracker } from "@/models/events/event-tracker"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { sendTicketConfirmation } from "@/lib/send-grid"
import { BookingStatus } from "@/models/events/types"
import mongoose from "mongoose"
import { createWaitingListApprovalNotification } from "@/lib/notification-helper"
import { Users } from "@/models/userModal"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const { waitingListId, eventName } = req.body

		if (!waitingListId) {
			return sendResponse(res, null, "Waiting list ID is required", false, ResCode.BAD_REQUEST)
		}

		// Find the waiting list entry
		const waitingListEntry = await WaitingList.findById(waitingListId)

		if (!waitingListEntry) {
			return sendResponse(res, null, "Waiting list entry not found", false, ResCode.NOT_FOUND)
		}

		// Get the event details
		const event = await Events.findById(waitingListEntry.eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Check event capacity before approving
		const eventTracker = await EventTracker.findOne({ eventId: waitingListEntry.eventId })
		if (!eventTracker) {
			return sendResponse(res, null, "Event tracker not found", false, ResCode.NOT_FOUND)
		}

		// Calculate total tickets requested by this waiting list user
		const requestedTickets = waitingListEntry.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)

		// Check if adding these tickets would exceed capacity
		if (eventTracker.bookedTickets + requestedTickets > eventTracker.eventCapacity) {
			return sendResponse(res, null, "Cannot approve: Event is at full capacity", false, ResCode.BAD_REQUEST)
		}

		// Generate booking reference
		const bookingRef = `JZ-${Math.random().toString(36).substring(2, 15)}`

		// Calculate totals
		const subTotal = waitingListEntry.tickets.reduce((sum, ticket) => sum + ticket.price * ticket.quantity, 0)
		const tax = 0 // No tax for now
		const total = subTotal + tax

		// Create the booking
		const booking = await Bookings.create({
			bookingRef,
			eventId: waitingListEntry.eventId,
			tickets: waitingListEntry.tickets.map((ticket) => ({
				ticketId: new mongoose.Types.ObjectId(ticket.ticketId),
				quantity: ticket.quantity,
			})),
			status: BookingStatus.CONFIRMED,
			customerName: `${waitingListEntry.firstName} ${waitingListEntry.lastName}`,
			customerEmail: waitingListEntry.email,
			customerPhone: waitingListEntry.phone,
			subTotal,
			tax,
			total,
		})

		// Update event tracker (already fetched above)
		const totalTicketsToAdd = waitingListEntry.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
		eventTracker.bookedTickets += totalTicketsToAdd
		await eventTracker.save()

		// Update waiting list status to approved
		await WaitingList.findByIdAndUpdate(waitingListId, { status: "approved" })

		// Send booking confirmation email
		try {
			console.log("Sending booking confirmation email to:", waitingListEntry.email)
			await sendTicketConfirmation({
				event,
				firstName: waitingListEntry.firstName,
				lastName: waitingListEntry.lastName,
				email: waitingListEntry.email,
				phone: waitingListEntry.phone,
				tickets: waitingListEntry.tickets.map((ticket) => ({
					name: ticket.name,
					price: ticket.price,
					quantity: ticket.quantity,
					desc: "",
				})),
				orderNumber: bookingRef,
			})
			console.log("Booking confirmation email sent successfully")
		} catch (emailError) {
			console.error("Failed to send booking confirmation email:", emailError)
			// Don't fail the request if email fails
		}

		// Create notification for user
		try {
			const user = await Users.findOne({ email: waitingListEntry.email })
			if (user) {
				await createWaitingListApprovalNotification(user._id, waitingListEntry.eventId, event.name)
				console.log("Waiting list approval notification created")
			}
		} catch (notificationError) {
			console.error("Failed to create waiting list notification:", notificationError)
			// Don't fail the request if notification fails
		}

		return sendResponse(
			res,
			{
				success: true,
				booking: booking,
				bookingRef: bookingRef,
			},
			"User approved, booking created and confirmation email sent",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("Error approving waiting list user:", error)
		return sendResponse(res, null, "Failed to approve user", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
