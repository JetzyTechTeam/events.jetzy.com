import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { NextApiRequest, NextApiResponse } from "next"
import { Types } from "mongoose"
import { ensureDbConnected } from "@/configs/database"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		await ensureDbConnected()
		const { eventId } = req.query

		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		// Dynamically import the model to avoid top-level schema compilation issues
		const InterestV2model = (await import("@/models/interestV2")).default

		// Find the interest group associated with this event
		const interest = await InterestV2model.findOne({ eventId: new Types.ObjectId(eventId) }).select('_id')

		if (!interest) {
			return sendResponse(res, null, "Chat group not found for this event", false, ResCode.NOT_FOUND)
		}

		return sendResponse(res, { interestId: interest._id.toString() }, "Chat info retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[events/[eventId]/chat-info] Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
