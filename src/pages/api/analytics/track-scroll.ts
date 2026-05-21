import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { WebScroll } from "@/models/analytics"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

const MILESTONES = [25, 50, 75, 100]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		const { sessionId, anonId, page, eventId, depthPct } = req.body

		if (!sessionId || !page || typeof depthPct !== "number") {
			return sendResponse(res, null, "sessionId, page, depthPct required", false, ResCode.BAD_REQUEST)
		}

		const clamped = Math.max(0, Math.min(100, Math.round(depthPct)))
		const userId = session?.user && (session.user as any)._id ? new Types.ObjectId((session.user as any)._id) : undefined
		const eventObjectId = eventId ? new Types.ObjectId(eventId) : undefined

		const milestonesReached = MILESTONES.filter((m) => clamped >= m)

		WebScroll.findOneAndUpdate(
			{ sessionId, page },
			{
				$setOnInsert: {
					sessionId,
					page,
					userId,
					anonId: anonId || undefined,
					eventId: eventObjectId,
					timestamp: new Date(),
				},
				$max: { maxDepthPct: clamped },
				$addToSet: { reachedMilestones: { $each: milestonesReached } },
			},
			{ upsert: true, new: false }
		).catch((error) => {
			console.error("[Analytics Track Scroll] Error:", error.message)
		})

		return sendResponse(res, { success: true }, "Scroll tracked", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Track Scroll] Error:", error.message)
		return sendResponse(res, null, "Scroll tracking failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
