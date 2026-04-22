import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { EventGuest } from "@/models/eventGuest"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

/**
 * API endpoint to get guest list for an event
 * GET /api/check-in/guests?eventId=xxx
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		// Verify admin authentication
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query

		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		if (!isAdmin) {
			const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }, { ownerId: 1 }).lean()
			if (!event || (event as any).ownerId?.toString() !== userId) {
				return sendResponse(res, null, "Access denied. You can only view guests for your own events.", false, ResCode.FORBIDDEN)
			}
		}

		// Fetch all guests for this event
		const guests = await EventGuest.find({ eventId })
			.sort({ checkedInAt: -1 }) // Most recent first
			.lean()

		const guestList = guests.map((guest) => ({
			id: guest._id.toString(),
			guestName: guest.guestName,
			guestEmail: guest.guestEmail,
			guestPhone: guest.guestPhone,
			bookingEmail: guest.bookingEmail,
			checkedInAt: guest.checkedInAt,
			checkedInBy: guest.checkedInBy,
		}))

		return sendResponse(res, { guests: guestList, total: guestList.length }, "Guest list retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Get guest list error:", error)
		return sendResponse(res, null, error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
