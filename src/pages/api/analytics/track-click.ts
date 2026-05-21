import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { WebClick, UserJourney } from "@/models/analytics"
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
		const {
			sessionId,
			anonId,
			page,
			eventId,
			elementTag,
			elementText,
			elementId,
			elementClass,
			dataTrack,
			href,
			x,
			y,
			viewportW,
			viewportH,
			noEffect,
		} = req.body

		if (!sessionId || !page) {
			return sendResponse(res, null, "sessionId and page required", false, ResCode.BAD_REQUEST)
		}

		const userId = session?.user && (session.user as any)._id ? new Types.ObjectId((session.user as any)._id) : undefined
		const eventObjectId = eventId ? new Types.ObjectId(eventId) : undefined
		const timestamp = new Date()

		let isRageClick = false
		if (typeof x === "number" && typeof y === "number") {
			const oneSecAgo = new Date(timestamp.getTime() - 1000)
			const recentCount = await WebClick.countDocuments({
				sessionId,
				timestamp: { $gte: oneSecAgo },
				x: { $gte: x - 50, $lte: x + 50 },
				y: { $gte: y - 50, $lte: y + 50 },
			})
			if (recentCount >= 2) isRageClick = true
		}

		WebClick.create({
			sessionId,
			userId,
			anonId: anonId || undefined,
			page,
			eventId: eventObjectId,
			elementTag,
			elementText: typeof elementText === "string" ? elementText.slice(0, 200) : undefined,
			elementId,
			elementClass: typeof elementClass === "string" ? elementClass.slice(0, 300) : undefined,
			dataTrack,
			href,
			x,
			y,
			viewportW,
			viewportH,
			isRageClick,
			isDeadClick: !!noEffect,
			timestamp,
		}).catch((error) => {
			console.error("[Analytics Track Click] Error:", error.message)
		})

		UserJourney.findOneAndUpdate(
			{ sessionId },
			{
				$setOnInsert: { sessionId, userId, anonId: anonId || undefined },
				$push: {
					journey: {
						action: "click",
						page,
						eventId: eventObjectId,
						timestamp,
						metadata: { text: elementText, dataTrack, href, isRageClick },
					},
				},
			},
			{ upsert: true, new: false }
		).catch((error) => {
			console.error("[Analytics Track Click] UserJourney error:", error.message)
		})

		return sendResponse(res, { success: true, isRageClick }, "Click tracked", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Track Click] Error:", error.message)
		return sendResponse(res, null, "Click tracking failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
