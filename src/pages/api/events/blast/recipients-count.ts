import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { EventInvitation } from "@/models/events/event-invitations"
import { Bookings } from "@/models/events/bookings"
import { WaitingList } from "@/models/waitingList"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'GET') {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	const session = await getServerSession(req, res, authOptions)

	try {
		if (!session) {
			return sendResponse(res, null, "You need to be logged in", false, ResCode.UNAUTHORIZED)
		}

		const { eventId, targetAudience, status } = req.query

		if (!eventId) {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		let count = 0
		const emails = new Set<string>()

		// Fetch based on target audience
		if (targetAudience === "all") {
			// Get all: bookings + invited + waiting list
			const bookings = await Bookings.find({ eventId, isDeleted: false })
			bookings.forEach(b => emails.add(b.customerEmail.toLowerCase()))

			const invited = await EventInvitation.find({ eventId })
			invited.forEach(i => emails.add(i.email.toLowerCase()))

			const waiting = await WaitingList.find({ eventId })
			waiting.forEach(w => emails.add(w.email.toLowerCase()))

			count = emails.size
		} else if (targetAudience === "bookings_only") {
			// Only confirmed bookings
			const bookings = await Bookings.find({ eventId, isDeleted: false })
			bookings.forEach(b => emails.add(b.customerEmail.toLowerCase()))
			count = emails.size
		} else if (targetAudience === "invited_only") {
			// Invited guests with status filter
			const query: any = { eventId }
			if (status && status !== "all") {
				query.status = status
			}
			const invited = await EventInvitation.find(query)
			count = invited.length
		} else if (targetAudience === "waiting_list") {
			// Waiting list only
			const waiting = await WaitingList.find({ eventId })
			count = waiting.length
		}

		return sendResponse(res, { count }, "Recipient count fetched successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error fetching recipient count:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
