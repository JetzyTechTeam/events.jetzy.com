// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)

	try {
		// make sure user is logged-in before creating events
		if (!session) return sendResponse(res, null, "You need to be logged in to perform this action.", false, ResCode.UNAUTHORIZED)

		// Get the event id from the request
		const { eventId } = req.query

		// Find the event by id and delete it
		const event = await Events.findById(eventId)
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		// Now lets make sure the event has not booking and the date is not past
		const bookings = await event.getBookings()
		if (bookings.length > 0) {
			// soft delete the event
			await Events.findByIdAndUpdate(eventId, { isDeleted: true })
		} else {
			// hard delete the event
			await Events.findByIdAndDelete(eventId)
			event.deleteTracker()
		}

		return sendResponse(res, null, "Event deleted successfully", true, ResCode.NO_CONTENT)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
