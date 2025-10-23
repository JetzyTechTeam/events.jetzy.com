import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { sendWaitingListNotification } from "@/lib/send-grid"
import { dbconn } from "@/configs/database"
import mongoose from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		console.log("Waiting list add request:", req.body)
		
		// Check database connection
		if (dbconn.readyState !== 1) {
			console.log("Database not connected, attempting to connect...")
			await dbconn.asPromise()
		}
		
		const { eventId, firstName, lastName, email, phone, tickets, eventName } = req.body

		// Validate required fields
		if (!eventId || !firstName || !lastName || !email || !phone || !tickets) {
			console.log("Missing required fields:", { eventId, firstName, lastName, email, phone, tickets })
			return sendResponse(res, null, "Missing required fields", false, ResCode.BAD_REQUEST)
		}

		// Transform tickets to match schema
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
