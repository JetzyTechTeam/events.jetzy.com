import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { UserJourney } from "@/models/analytics"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		if (!isAdmin) {
			return sendResponse(res, null, "Forbidden - Admin access required", false, ResCode.FORBIDDEN)
		}

		const { sessionId, userId, limit = "50", dateFrom, dateTo } = req.query as {
			sessionId?: string
			userId?: string
			limit?: string
			dateFrom?: string
			dateTo?: string
		}

		const limitNum = parseInt(limit, 10)
		if (isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
			return sendResponse(res, null, "Invalid limit (1-500)", false, ResCode.BAD_REQUEST)
		}

		// Build query
		const query: any = {}
		if (sessionId) query.sessionId = sessionId
		if (userId) query.userId = new Types.ObjectId(userId)

		// Build date filter
		if (dateFrom || dateTo) {
			query.createdAt = {}
			if (dateFrom) {
				const fromDate = new Date(dateFrom)
				fromDate.setHours(0, 0, 0, 0) // Start of day
				query.createdAt.$gte = fromDate
			}
			if (dateTo) {
				const toDate = new Date(dateTo)
				toDate.setHours(23, 59, 59, 999) // End of day
				query.createdAt.$lte = toDate
			}
		}

		// Fetch journeys
		const journeys = await UserJourney.find(query)
			.sort({ createdAt: -1 })
			.limit(limitNum)
			.lean()

		// Get total count
		const total = await UserJourney.countDocuments(query)

		// Format response
		const formattedJourneys = journeys.map((journey: any) => ({
			_id: journey._id.toString(),
			sessionId: journey.sessionId,
			userId: journey.userId?.toString() || null,
			journey: journey.journey.map((step: any) => ({
				action: step.action,
				page: step.page || null,
				eventId: step.eventId?.toString() || null,
				timestamp: step.timestamp,
				duration: step.duration || null,
				metadata: step.metadata || null,
			})),
			journeyLength: journey.journey.length,
			createdAt: journey.createdAt,
			updatedAt: journey.updatedAt,
		}))

		return sendResponse(
			res,
			{
				journeys: formattedJourneys,
				total,
				limit: limitNum,
				filters: {
					sessionId: sessionId || null,
					userId: userId || null,
					dateRange: {
						from: dateFrom || null,
						to: dateTo || null,
					},
				},
			},
			"User journeys retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Analytics Journey] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch user journeys", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

