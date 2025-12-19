import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { NextApiRequest, NextApiResponse } from "next"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[events/[eventId]] Database not connected, attempting to connect...")
			await dbconn.asPromise()
		}

		// get the request path parameter
		const { eventId } = req.query

		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		// Convert to ObjectId
		const eventObjectId = new Types.ObjectId(eventId)

		// get the event from the database
		const event = await Events.findById(eventObjectId)
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		return sendResponse(res, event, "Event retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.error("[events/[eventId]] Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
