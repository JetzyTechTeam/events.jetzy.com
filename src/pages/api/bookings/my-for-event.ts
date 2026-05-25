import { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { ensureDbConnected } from "@/configs/database"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { BookingStatus } from "@/models/events/types"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Not authenticated", false, ResCode.UNAUTHORIZED)
		}

		const eventId = req.query.eventId as string
		if (!eventId || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid eventId is required", false, ResCode.BAD_REQUEST)
		}

		const userId = (session.user as any)?._id || (session.user as any)?.id
		const email = session.user?.email

		const orClauses: any[] = []
		if (userId) orClauses.push({ bookerUserId: new Types.ObjectId(userId) })
		if (email) orClauses.push({ customerEmail: email.toLowerCase() })
		if (orClauses.length === 0) {
			return sendResponse(res, null, "No identity to match", false, ResCode.BAD_REQUEST)
		}

		const booking = await Bookings.findOne({
			eventId: new Types.ObjectId(eventId),
			isDeleted: false,
			status: { $ne: BookingStatus.CANCELLED },
			$or: orClauses,
		}).lean()

		return sendResponse(res, booking ?? null, "OK", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error fetching user booking:", error)
		return sendResponse(res, null, `Failed: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
