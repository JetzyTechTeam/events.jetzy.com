
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { EventInteraction, UserJourney } from "@/models/analytics"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		const { eventId, sessionId, interactionType, metadata } = req.body

		if (!eventId || !sessionId || !interactionType) {
			return sendResponse(res, null, "Event ID, session ID, and interaction type are required", false, ResCode.BAD_REQUEST)
		}

		// Validate interaction type
		const validTypes = ["view", "click", "share", "ticket_select", "booking_start"]
		if (!validTypes.includes(interactionType)) {
			return sendResponse(res, null, "Invalid interaction type", false, ResCode.BAD_REQUEST)
		}

		// Get user ID if logged in
		const userId = session?.user && (session.user as any)._id ? new Types.ObjectId((session.user as any)._id) : undefined

		const eventObjectId = new Types.ObjectId(eventId)
		const timestamp = new Date()

		// Fire and forget - don't block the request
		EventInteraction.create({
			eventId: eventObjectId,
			sessionId,
			userId: userId,
			interactionType,
			timestamp,
			metadata: metadata || undefined,
		}).catch((error) => {
			console.error("[Analytics Track Event Interaction] Error:", error.message)
		})

		// Update UserJourney - add event interaction step
		const journeyStep = {
			action: `event_${interactionType} `,
			eventId: eventObjectId,
			timestamp,
			metadata: metadata || undefined,
		}

		UserJourney.findOneAndUpdate(
			{ sessionId },
			{
				$setOnInsert: {
					sessionId,
					userId: userId,
				},
				$push: {
					journey: journeyStep,
				},
			},
			{ upsert: true, new: false }
		).catch((error) => {
			console.error("[Analytics Track Event Interaction] UserJourney update error:", error.message)
		})

		return sendResponse(res, { success: true }, "Event interaction tracked successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Track Event Interaction] Error:", error.message)
		// Return OK to not break frontend
		return sendResponse(res, null, "Event interaction tracking failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

