import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import mongoose from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	const { eventId } = req.query

	if (req.method === "GET") {
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
