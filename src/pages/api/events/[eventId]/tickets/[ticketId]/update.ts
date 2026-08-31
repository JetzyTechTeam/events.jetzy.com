import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { Types } from "mongoose"
import zod from "zod"

const schema = zod.object({
	title: zod.string().nonempty(),
	description: zod.string().nonempty(),
})

/**
 * Renames a ticket on an event. Admin OR event owner.
 *
 * This route used to check `if (!session)` and nothing else, so ANY logged-in user could rename
 * a ticket on ANY event — the ids are in the URL and nothing tied them to the caller.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "PUT") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to edit a ticket.", false, ResCode.UNAUTHORIZED)
		}

		const { eventId, ticketId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		// Validated rather than passed straight to Mongoose: a malformed id throws a CastError,
		// which the catch below would turn into a 500 instead of a 400.
		if (!ticketId || typeof ticketId !== "string" || !Types.ObjectId.isValid(ticketId)) {
			return sendResponse(res, null, "Valid ticket ID is required", false, ResCode.BAD_REQUEST)
		}

		// Validate the request body before updating ticket
		const data = schema.safeParse(req.body)
		if (!data.success) return sendResponse(res, data.error.errors, data.error.message, false, ResCode.BAD_REQUEST)

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id ownerId").lean()
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. Only the event owner can edit tickets.", false, ResCode.FORBIDDEN)
		}

		// Update the ticket
		const updated = await Events.findOneAndUpdate(
			{ _id: eventId, "tickets._id": ticketId },
			{
				$set: {
					"tickets.$.name": data.data.title,
					"tickets.$.desc": data.data.description,
				},
			},
			{ new: true },
		)
		if (!updated) return sendResponse(res, null, "Ticket not found", false, ResCode.NOT_FOUND)

		return sendResponse(res, updated, "Ticket updated successfully", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
