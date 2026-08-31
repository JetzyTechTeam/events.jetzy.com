import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { Types } from "mongoose"

/**
 * Removes a ticket from an event. Admin OR event owner.
 *
 * This route used to check `if (!session)` and nothing else, so ANY logged-in user could delete
 * an unbooked ticket from ANY event.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "DELETE") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to perform this action.", false, ResCode.UNAUTHORIZED)
		}

		const { eventId, ticketId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		// Validated rather than handed to Mongoose: a malformed id throws a CastError, which the
		// catch below would report as a 500 instead of a 400.
		if (!ticketId || typeof ticketId !== "string" || !Types.ObjectId.isValid(ticketId)) {
			return sendResponse(res, null, "Valid ticket ID is required", false, ResCode.BAD_REQUEST)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id ownerId").lean()
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. Only the event owner can delete tickets.", false, ResCode.FORBIDDEN)
		}

		// Proves the ticket belongs to THIS event, so the booking check below can be scoped to it.
		if (!(await Events.exists({ _id: eventId, "tickets._id": { $in: [ticketId] } }))) {
			return sendResponse(res, null, "Ticket not found", false, ResCode.NOT_FOUND)
		}

		// Bookings that still mean something block the delete.
		//
		// Scoped to this event: the query used to search every booking in the collection, so a
		// stale row pointing at a deleted event could block a legitimate delete with a confusing
		// message.
		//
		// Blocks on anything NOT known to be dead, rather than allow-listing live statuses.
		// `status` is not a closed set — `checked_in` is written in prod by the mobile app — and
		// an allow-list would silently let a ticket be deleted out from under a status we don't
		// recognise. Only cancelled / rejected / failed / refunded are ignorable. Before this the
		// query counted those too, so a ticket whose only orders failed at the card could never
		// be deleted.
		const ignorable: string[] = [BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.FAILED, BookingStatus.REFUNDED]
		const hasLiveBooking = await Bookings.exists({
			eventId: new Types.ObjectId(eventId),
			status: { $nin: ignorable },
			tickets: { $elemMatch: { ticketId: new Types.ObjectId(ticketId) } },
		})
		if (hasLiveBooking) {
			return sendResponse(res, null, "Ticket has bookings and cannot be deleted", false, ResCode.BAD_REQUEST)
		}

		const updatedEvent = await Events.findByIdAndUpdate(eventId, { $pull: { tickets: { _id: ticketId } } }, { new: true })
		if (!updatedEvent) return sendResponse(res, null, "Ticket not found", false, ResCode.NOT_FOUND)

		return sendResponse(res, null, "Ticket deleted successfully", true, ResCode.NO_CONTENT)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
