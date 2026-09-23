import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { Blasts } from "@/models/events/blast"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to manage blasts.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query
		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Allow admin or event owner only
		if (!isAdmin && event.ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. You can only manage blasts for your own events.", false, ResCode.FORBIDDEN)
		}

		if (req.method === "GET") {
			// `recipients` is deliberately excluded. A 2,000-guest blast carries a 2,000-entry
			// array, and this list renders five rows of counts — pulling every address on every
			// page load would dwarf the rest of the response. The detail endpoint
			// (`blasts/[blastId]` GET) serves them on demand when a host expands a row.
			const blasts = await Blasts.find({
				eventId: new Types.ObjectId(eventId),
				isDeleted: false,
			})
				.select("-recipients")
				.sort({ createdAt: -1 })

			return sendResponse(res, blasts, "Blasts retrieved successfully", true, ResCode.OK)
		}

		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	} catch (error: any) {
		console.error("[blasts/index] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
