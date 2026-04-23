import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { CheckIn } from "@/models/checkIn"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

/**
 * GET /api/check-in/booking-status?eventId=xxx
 * Returns per-booking check-in records for an event (admin or owner).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()

	try {
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
				return sendResponse(res, null, "Access denied.", false, ResCode.FORBIDDEN)
			}
		}

		const checkIns = await CheckIn.find({ eventId: new Types.ObjectId(eventId) }).lean()

		const data = checkIns.map((ci) => ({
			bookingId: ci.bookingId.toString(),
			checkedInCount: ci.checkedInCount,
			isFullyCheckedIn: ci.isFullyCheckedIn,
		}))

		return sendResponse(res, data, "Check-in status retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Check-in booking-status error:", error)
		return sendResponse(res, null, error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
