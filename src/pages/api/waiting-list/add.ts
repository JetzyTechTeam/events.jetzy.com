import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { sendWaitingListNotification } from "@/lib/send-grid"
import { ensureDbConnected } from "@/configs/database"
import mongoose from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		console.log("Waiting list add request:", req.body)
		
		await ensureDbConnected()
		
		const { eventId, firstName, lastName, email, phone, tickets, eventName } = req.body

		// Validate required fields
		if (!eventId || !firstName || !lastName || !email || !phone || !tickets) {
			console.log("Missing required fields:", { eventId, firstName, lastName, email, phone, tickets })
			return sendResponse(res, null, "Missing required fields", false, ResCode.BAD_REQUEST)
		}

		// Transform tickets to match schema
		// A BID has no waiting list: approving an entry creates a booking with no payment, at
		// whatever price the browser sent — and a bid's price is the guest's own (`ticket-bid.ts`).
		// A normal entry for a ticket that also takes bids is an ordinary waiting-list entry.
		// A BID-ONLY ticket has no waiting list either: an approved entry would be a free ticket.
		{
			const { isBidOrderRow, isBidOnlyTicket } = await import("@/lib/ticket-bid")
			const rows = Array.isArray(tickets) ? tickets : []
			if (rows.some((t: any) => isBidOrderRow(t))) {
				return sendResponse(res, null, "Bids don't have a waiting list — choose the normal price to join it.", false, ResCode.BAD_REQUEST)
			}
			const { Events } = await import("@/models/events")
			const ev: any = mongoose.Types.ObjectId.isValid(eventId) ? await Events.findById(eventId).select("tickets").lean() : null
			const ids = rows.map((t: any) => String(t?.id || t?.ticketId))
			if ((ev?.tickets || []).some((t: any) => ids.includes(String(t._id)) && isBidOnlyTicket(t))) {
				return sendResponse(res, null, "This ticket only takes bids, so it has no waiting list.", false, ResCode.BAD_REQUEST)
			}
		}

		const transformedTickets = tickets.map((ticket: any) => ({
			ticketId: ticket.id || ticket.ticketId,
			quantity: ticket.quantity || 1,
			name: ticket.name,
			price: ticket.price || 0
		}))

		console.log("Transformed tickets:", transformedTickets)

		// Convert eventId to ObjectId for proper database operations
		const objectId = new mongoose.Types.ObjectId(eventId)
		
		// Check if user is already on waiting list for this event
		const existingEntry = await WaitingList.findOne({
			eventId: objectId,
			email,
		})

		if (existingEntry) {
			console.log("User already on waiting list:", existingEntry._id)
			// User is already on waiting list, return success without error
			return sendResponse(res, existingEntry, "Already on waiting list", true, ResCode.OK)
		}

		// Add to waiting list
		const waitingListEntry = await WaitingList.create({
			eventId: objectId,
			firstName,
			lastName,
			email,
			phone,
			tickets: transformedTickets,
			status: 'waiting',
		})

		console.log("Created waiting list entry:", waitingListEntry._id)

		// Send notification email
		try {
			await sendWaitingListNotification({
				firstName,
				lastName,
				email,
				eventName: eventName || "Event",
			})
			console.log("Waiting list notification sent successfully")
		} catch (emailError) {
			console.error("Failed to send waiting list notification:", emailError)
			// Don't fail the request if email fails
		}

		return sendResponse(res, waitingListEntry, "Added to waiting list successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error adding to waiting list:", error)
		console.error("Error details:", {
			message: error.message,
			stack: error.stack,
			name: error.name
		})
		return sendResponse(res, null, `Failed to add to waiting list: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
