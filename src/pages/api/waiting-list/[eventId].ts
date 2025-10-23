import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const { eventId } = req.query

	if (req.method === "GET") {
		try {
			const waitingList = await WaitingList.find({ 
				eventId,
				status: 'waiting'
			}).sort({ createdAt: 1 }) // Oldest first

			return sendResponse(res, waitingList, "Waiting list retrieved successfully", true, ResCode.OK)
		} catch (error: any) {
			console.error("Error fetching waiting list:", error)
			return sendResponse(res, null, "Failed to fetch waiting list", false, ResCode.INTERNAL_SERVER_ERROR)
		}
	}

	return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
}
