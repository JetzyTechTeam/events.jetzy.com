import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { SavedEvents } from "@/models/events/saved-events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)

		if (!session) {
			return sendResponse(res, null, "You need to be logged in to save events", false, ResCode.UNAUTHORIZED)
		}

		const userId = (session.user as any)?._id
		if (!userId) {
			return sendResponse(res, null, "Invalid user session. Please log in again.", false, ResCode.UNAUTHORIZED)
		}

		const { eventId, action } = req.body

		if (!eventId) {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		if (!action || !["save", "unsave"].includes(action)) {
			return sendResponse(res, null, "Action must be 'save' or 'unsave'", false, ResCode.BAD_REQUEST)
		}

		// Verify event exists
		const event = await Events.findById(eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const userObjectId = new Types.ObjectId(userId)
		const eventObjectId = new Types.ObjectId(eventId)

		if (action === "save") {
			// Check if already saved
			const existingSave = await SavedEvents.findOne({
				userId: userObjectId,
				eventId: eventObjectId,
			})

			if (existingSave) {
				return sendResponse(res, { isSaved: true }, "Event is already saved", true, ResCode.OK)
			}

			// Save the event
			await SavedEvents.create({
				userId: userObjectId,
				eventId: eventObjectId,
			})

			return sendResponse(res, { isSaved: true }, "Event saved successfully", true, ResCode.OK)
		} else {
			// Unsave the event
			const result = await SavedEvents.findOneAndDelete({
				userId: userObjectId,
				eventId: eventObjectId,
			})

			if (!result) {
				return sendResponse(res, { isSaved: false }, "Event was not saved", true, ResCode.OK)
			}

			return sendResponse(res, { isSaved: false }, "Event unsaved successfully", true, ResCode.OK)
		}
	} catch (error: any) {
		console.error("Error saving/unsaving event:", error)
		return sendResponse(
			res,
			null,
			error.message || "Failed to save/unsave event",
			false,
			ResCode.INTERNAL_SERVER_ERROR
		)
	}
}

