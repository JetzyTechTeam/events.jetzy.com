import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { sendWaitingListNotification } from "@/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const { eventId, firstName, lastName, email, phone, tickets } = req.body

		// Validate required fields
		if (!eventId || !firstName || !lastName || !email || !phone || !tickets) {
			return sendResponse(res, null, "Missing required fields", false, ResCode.BAD_REQUEST)
		}

		// Check if user is already on waiting list for this event
		const existingEntry = await WaitingList.findOne({
			eventId,
			email,
		})

		if (existingEntry) {
			// User is already on waiting list, return success without error
			return sendResponse(res, existingEntry, "Already on waiting list", true, ResCode.OK)
		}

		// Add to waiting list
		const waitingListEntry = await WaitingList.create({
			eventId,
			firstName,
			lastName,
			email,
			phone,
			tickets,
			status: 'waiting',
		})

		// Send notification email
		try {
			await sendWaitingListNotification({
				firstName,
				lastName,
				email,
				eventName: req.body.eventName || "Event",
			})
		} catch (emailError) {
			console.error("Failed to send waiting list notification:", emailError)
			// Don't fail the request if email fails
		}

		return sendResponse(res, waitingListEntry, "Added to waiting list successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error adding to waiting list:", error)
		return sendResponse(res, null, "Failed to add to waiting list", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
