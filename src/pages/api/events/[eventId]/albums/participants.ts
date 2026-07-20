import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import { getEventParticipants } from "@/lib/event-participants"

/**
 * Attendee suggestions for the photo-tagging box.
 *
 * Admin/owner only on purpose: anyone with a share link can view an album and tag people,
 * but handing every viewer the event's full attendee email list would leak personal data.
 * Guests can still tag by typing a name + email themselves.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, [], "No suggestions available.", true, ResCode.OK)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id ownerId").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			// Not the host — no attendee list, but tagging by hand still works.
			return sendResponse(res, [], "No suggestions available.", true, ResCode.OK)
		}

		const participants = await getEventParticipants(eventId)
		const items = Array.from(participants.entries()).map(([email, name]) => ({ email, name }))

		return sendResponse(res, items, "Participants retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/participants] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
