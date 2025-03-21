import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		// get the request path parameter
		const { eventId } = req.query

		// get the event from the database
		const event = await Events.findById(eventId)
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		return sendResponse(res, event, "Event retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
