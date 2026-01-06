import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { SavedEvents } from "@/models/events/saved-events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)

		if (!session) {
			return sendResponse(res, { isSaved: false }, "User not logged in", true, ResCode.OK)
		}

		const userId = (session.user as any)?._id
		if (!userId) {
			return sendResponse(res, { isSaved: false }, "Invalid user session", true, ResCode.OK)
		}

		const { eventId } = req.query

		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		const userObjectId = new Types.ObjectId(userId)
		const eventObjectId = new Types.ObjectId(eventId)

		// Check if event is saved
		const savedEvent = await SavedEvents.findOne({
			userId: userObjectId,
			eventId: eventObjectId,
		})

		return sendResponse(
			res,
			{ isSaved: !!savedEvent },
			savedEvent ? "Event is saved" : "Event is not saved",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error checking saved event:", error)
		return sendResponse(
			res,
			{ isSaved: false },
			error.message || "Failed to check saved status",
			true,
			ResCode.OK
		)
	}
}


