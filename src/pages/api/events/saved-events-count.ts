import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { SavedEvents } from "@/models/events/saved-events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)

		if (!session) {
			return sendResponse(res, { count: 0 }, "User not logged in", true, ResCode.OK)
		}

		const userId = (session.user as any)?._id
		if (!userId) {
			return sendResponse(res, { count: 0 }, "Invalid user session", true, ResCode.OK)
		}

		const userObjectId = new Types.ObjectId(userId)

		// Count saved events for this user
		const count = await SavedEvents.countDocuments({
			userId: userObjectId,
		})

		return sendResponse(
			res,
			{ count },
			"Saved events count retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error fetching saved events count:", error)
		return sendResponse(
			res,
			{ count: 0 },
			error.message || "Failed to retrieve saved events count",
			true,
			ResCode.OK
		)
	}
}

