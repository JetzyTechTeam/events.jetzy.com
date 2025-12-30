import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "DELETE") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[waiting-list/remove] Database not connected, attempting to connect...")
			try {
				await Promise.race([
					dbconn.asPromise(),
					new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 30000)),
				])
				console.log("[waiting-list/remove] Database connected successfully")
			} catch (connError: any) {
				console.error("[waiting-list/remove] Database connection failed:", connError.message)
				return sendResponse(res, null, "Database connection failed. Please try again later.", false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}

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
		const errorMessage = error?.message || "An unexpected error occurred while removing the user"
		return sendResponse(res, null, errorMessage, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
