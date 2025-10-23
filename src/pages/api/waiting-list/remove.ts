import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "DELETE") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const { waitingListId } = req.body

		if (!waitingListId) {
			return sendResponse(res, null, "Waiting list ID is required", false, ResCode.BAD_REQUEST)
		}

		// Remove the waiting list entry
		const result = await WaitingList.findByIdAndDelete(waitingListId)
		
		if (!result) {
			return sendResponse(res, null, "Waiting list entry not found", false, ResCode.NOT_FOUND)
		}

		return sendResponse(res, { success: true }, "User removed from waiting list successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error removing waiting list user:", error)
		return sendResponse(res, null, "Failed to remove user", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
