import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
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
			return sendResponse(res, null, "You need to be logged in to view saved events", false, ResCode.UNAUTHORIZED)
		}

		const userId = (session.user as any)?._id
		if (!userId) {
			return sendResponse(res, null, "Invalid user session. Please log in again.", false, ResCode.UNAUTHORIZED)
		}

		// Get pagination parameters
		const limit = req.query.limit ? parseInt(req.query.limit as string) : 20
		const page = req.query.page ? parseInt(req.query.page as string) : 1
		const skip = (page - 1) * limit

		const userObjectId = new Types.ObjectId(userId)

		// Find all saved events for this user
		const savedEvents = await SavedEvents.find({
			userId: userObjectId,
		})
			.sort({ createdAt: -1 })
			.lean()

		// Get event IDs from saved events
		const eventIds = savedEvents.map((saved) => saved.eventId)

		if (eventIds.length === 0) {
			return sendResponse(
				res,
				{ events: [], pagination: { total: 0, page: 1, showing: 0, limit, totalPages: 0 } },
				"No saved events found",
				true,
				ResCode.OK
			)
		}

		// Fetch event details for these events
		const events = await Events.find({
			_id: { $in: eventIds },
			isDeleted: false,
		})
			.sort({ startsOn: 1 })
			.skip(skip)
			.limit(limit)
			.lean()

		// Get total count of saved events
		const totalSavedEvents = eventIds.length
		const totalPages = Math.ceil(totalSavedEvents / limit)

		const pagination = {
			total: totalSavedEvents,
			totalPages,
			page,
			showing: events.length,
			limit,
		}

		return sendResponse(
			res,
			{ events, pagination },
			"Saved events retrieved successfully!",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error fetching saved events:", error)
		return sendResponse(
			res,
			null,
			error.message || "Failed to retrieve saved events",
			false,
			ResCode.INTERNAL_SERVER_ERROR
		)
	}
}


