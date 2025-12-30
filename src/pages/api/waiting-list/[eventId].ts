import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import mongoose from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const { eventId } = req.query

	if (req.method === "GET") {
		try {
			console.log("[waiting-list/[eventId]] Fetching waiting list for eventId:", eventId, "Type:", typeof eventId)
			
			// Convert string eventId to ObjectId for proper querying
			let objectId: mongoose.Types.ObjectId
			try {
				objectId = new mongoose.Types.ObjectId(eventId as string)
			} catch (error) {
				console.error("[waiting-list/[eventId]] Invalid eventId format:", eventId)
				return sendResponse(res, null, "Invalid event ID format", false, ResCode.BAD_REQUEST)
			}
			
			// First, check all entries for this event (any status) for debugging
			const allEntries = await WaitingList.find({ eventId: objectId }).lean()
			console.log("[waiting-list/[eventId]] All entries for event (any status):", allEntries.length)
			if (allEntries.length > 0) {
				console.log("[waiting-list/[eventId]] Entry details:", allEntries.map((e: any) => ({ 
					_id: e._id?.toString(), 
					email: e.email, 
					status: e.status,
					eventId: e.eventId?.toString(),
					eventIdType: e.eventId?.constructor?.name,
					createdAt: e.createdAt 
				})))
			} else {
				console.log("[waiting-list/[eventId]] No entries found for eventId:", objectId.toString())
				// Try to find entries with string eventId as fallback
				const stringEntries = await WaitingList.find({ eventId: eventId as string }).lean()
				console.log("[waiting-list/[eventId]] Entries found with string eventId:", stringEntries.length)
			}
			
			// Query for waiting status entries using ObjectId
			// Only show 'waiting' entries - approved entries should not appear in the list
			const waitingList = await WaitingList.find({ 
				eventId: objectId,
				status: 'waiting'
			}).sort({ createdAt: 1 }).lean() // Oldest first

			console.log("[waiting-list/[eventId]] Found waiting list entries:", waitingList.length)
			if (waitingList.length > 0) {
				console.log("[waiting-list/[eventId]] Waiting entries:", waitingList.map((e: any) => ({ 
					_id: e._id?.toString(), 
					email: e.email, 
					status: e.status 
				})))
			}
			
			return sendResponse(res, waitingList, "Waiting list retrieved successfully", true, ResCode.OK)
		} catch (error: any) {
			console.error("[waiting-list/[eventId]] Error fetching waiting list:", error)
			console.error("[waiting-list/[eventId]] Error details:", {
				message: error.message,
				stack: error.stack,
				eventId: eventId
			})
			return sendResponse(res, null, "Failed to fetch waiting list", false, ResCode.INTERNAL_SERVER_ERROR)
		}
	}

	return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
}
