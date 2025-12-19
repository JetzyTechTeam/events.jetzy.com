import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { EventGuest } from "@/models/eventGuest"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

/**
 * API endpoint to get guest list for an event
 * GET /api/check-in/guests?eventId=xxx
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		// Verify admin authentication
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
		}

		// Verify admin access - Guest list is admin only
		// @ts-ignore
		if (session.user?.role !== "admin" && session.user?.role !== "super admin") {
			return sendResponse(res, null, "Access denied. Admin only.", false, ResCode.FORBIDDEN)
		}

		const { eventId } = req.query

		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
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
