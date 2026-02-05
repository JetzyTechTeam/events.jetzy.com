import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { UserAction, UserJourney } from "@/models/analytics"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)
		const { sessionId, actionType, page, metadata } = req.body

		if (!sessionId || !actionType || !page) {
			return sendResponse(res, null, "Session ID, action type, and page are required", false, ResCode.BAD_REQUEST)
		}

		// Validate action type
		const validTypes = ["search", "filter", "category_click", "form_start", "form_complete", "share", "button_click", "link_click"]
		if (!validTypes.includes(actionType)) {
			return sendResponse(res, null, "Invalid action type", false, ResCode.BAD_REQUEST)
		}

		// Get user ID if logged in
		const userId = session?.user && (session.user as any)._id ? new Types.ObjectId((session.user as any)._id) : undefined

		const timestamp = new Date()

		// Fire and forget - don't block the request
		UserAction.create({
			sessionId,
			userId: userId,
			actionType,
			page,
			timestamp,
			metadata: metadata || undefined,
		}).catch((error) => {
			console.error("[Analytics Track Action] Error:", error.message)
		})

		// Update UserJourney - add user action step
		const journeyStep = {
			action: actionType,
			page: page,
			timestamp,
			metadata: metadata || undefined,
		}

		UserJourney.findOneAndUpdate(
			{ sessionId },
			{
				$setOnInsert: {
					sessionId,
					userId: userId,
					journey: [],
				},
				$push: {
					journey: journeyStep,
				},
			},
			{ upsert: true, new: false }
		).catch((error) => {
			console.error("[Analytics Track Action] UserJourney update error:", error.message)
		})

		return sendResponse(res, { success: true }, "Action tracked successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Track Action] Error:", error.message)
		// Return OK to not break frontend
		return sendResponse(res, null, "Action tracking failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

