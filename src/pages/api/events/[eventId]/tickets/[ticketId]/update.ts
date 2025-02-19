import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import zod from "zod"

const schema = zod.object({
	title: zod.string().nonempty(),
	description: zod.string().nonempty(),
})

// create stripe instance

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)

	try {
		// make sure user is logged-in
		if (!session) return sendResponse(res, null, "You need to be logged in to create an event.", false, ResCode.UNAUTHORIZED)

		// Validate the request body before updating ticket
		const data = schema.safeParse(req.body)
		if (!data.success) return sendResponse(res, data.error.errors, data.error.message, false, ResCode.BAD_REQUEST)

		// Get the ticket id from the request body
		const { eventId, ticketId } = req.query

		// Update the ticket
		const event = await Events.updateOne(
			{ _id: eventId, "tickets._id": ticketId },
			{
				$set: {
					"tickets.$.name": data.data.title,
					"tickets.$.desc": data.data.description,
				},
			},
			{ new: true },
		)
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		return sendResponse(res, event, "Ticket updated successfully", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
