import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { sendWaitingListNotification } from "@/lib/send-grid"
import { withDbErrorHandling, handleDbError } from "@/lib/db-error-handler"
import mongoose from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		console.log("Waiting list add request:", req.body)

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
			price: ticket.price || 0,
		}))

		console.log("Transformed tickets:", transformedTickets)

		// Convert eventId to ObjectId for proper database operations
		const objectId = new mongoose.Types.ObjectId(eventId)

		// Wrap database operations with timeout and error handling
		const { existingEntry, waitingListEntry } = await withDbErrorHandling(
			async () => {
				// Check if user is already on waiting list for this event
				const existing = await WaitingList.findOne({
					eventId: objectId,
					email,
				}).exec()

				if (existing) {
					console.log("User already on waiting list:", existing._id)
					return { existingEntry: existing, waitingListEntry: null }
				}

				// Add to waiting list
				const newEntry = await WaitingList.create({
					eventId: objectId,
					firstName,
					lastName,
					email,
					phone,
					tickets: transformedTickets,
					status: "waiting",
				})

				console.log("Created waiting list entry:", newEntry._id)
				return { existingEntry: null, waitingListEntry: newEntry }
			},
			{ timeoutMs: 10000, ensureConnection: true },
		)

		if (existingEntry) {
			// User is already on waiting list, return success without error
			return sendResponse(res, existingEntry, "Already on waiting list", true, ResCode.OK)
		}

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
		return handleDbError(res, error, "Failed to add to waiting list")
	}
}
