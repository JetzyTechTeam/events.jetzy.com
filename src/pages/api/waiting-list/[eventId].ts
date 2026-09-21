import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import mongoose from "mongoose"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	const { eventId } = req.query

	if (req.method === "GET") {
		if (typeof eventId !== "string" || !mongoose.Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Invalid event ID", false, ResCode.BAD_REQUEST)
		}

		// Waiting list is PII — admin OR owner of the event only.
		const session = await getServerSession(req, res, authOptions)
		const userRole = (session?.user as any)?.role
		const userId = (session?.user as any)?._id?.toString()
		if (!userId) return sendResponse(res, null, "Not authenticated", false, ResCode.UNAUTHORIZED)
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const event = await Events.findById(eventId).select("ownerId").lean()
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Not authorized", false, ResCode.FORBIDDEN)
		}

		try {
			console.log("Fetching waiting list for eventId:", eventId)
			
			// Convert string eventId to ObjectId for proper querying
			const objectId = new mongoose.Types.ObjectId(eventId as string)
			
			const waitingList = await WaitingList.find({ 
				eventId: objectId,
				status: 'waiting'
			}).sort({ createdAt: 1 }) // Oldest first

			console.log("Found waiting list entries:", waitingList.length)
			return sendResponse(res, waitingList, "Waiting list retrieved successfully", true, ResCode.OK)
		} catch (error: any) {
			console.error("Error fetching waiting list:", error)
			return sendResponse(res, null, "Failed to fetch waiting list", false, ResCode.INTERNAL_SERVER_ERROR)
		}
	}

	return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
}
