import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)

	const { eventId, ticketId } = req.query

	try {
		// Check if the user is logged in
		if (!session) return sendResponse(res, null, "You need to be logged in to perform this action.", false, ResCode.UNAUTHORIZED)

		// Check if the ticket belongs to this event and the ticket exist
		if (!(await Events.exists({ _id: eventId, "tickets._id": { $in: [ticketId] } }))) return sendResponse(res, null, "Ticket not found", false, ResCode.NOT_FOUND)
		// Get the event by id
		const event = await Events.findOne({ _id: eventId, isDeleted: false })
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		// Make sure thes ticket has no bookings
		if (await Bookings.exists({ tickets: { $elemMatch: { ticketId } } })) return sendResponse(res, null, "Ticket has bookings and cannot be deleted", false, ResCode.BAD_REQUEST)

		// Delete the ticket
		const updatedEvent = await Events.findByIdAndUpdate(eventId, { $pull: { tickets: { _id: ticketId } } }, { new: true })
		if (!updatedEvent) return sendResponse(res, null, "Ticket not found", false, ResCode.NOT_FOUND)

		return sendResponse(res, null, "Ticket deleted successfully", true, ResCode.NO_CONTENT)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
