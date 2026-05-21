import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { WebClick } from "@/models/analytics"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const userId = (session.user as any)?._id?.toString()

		const { eventId, page, dateFrom, dateTo, limit = "2000" } = req.query as Record<string, string>

		const match: any = {}
		if (eventId) {
			if (!Types.ObjectId.isValid(eventId)) return sendResponse(res, null, "Invalid eventId", false, ResCode.BAD_REQUEST)
			if (!isAdmin) {
				const ev = await Events.findById(eventId, { ownerId: 1 }).lean()
				if (!ev || (ev as any).ownerId?.toString() !== userId) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)
			}
			match.eventId = new Types.ObjectId(eventId)
		} else if (!isAdmin) {
			return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)
		}
		if (page) match.page = page
		if (dateFrom || dateTo) {
			match.timestamp = {}
			if (dateFrom) { const d = new Date(dateFrom); d.setHours(0,0,0,0); match.timestamp.$gte = d }
			if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); match.timestamp.$lte = d }
		}

		const lim = Math.min(10000, Math.max(100, parseInt(limit, 10) || 2000))

		const clicks = await WebClick.find(match, { x: 1, y: 1, viewportW: 1, viewportH: 1, elementText: 1, isRageClick: 1 })
			.sort({ timestamp: -1 })
			.limit(lim)
			.lean()

		const topTargets = await WebClick.aggregate([
			{ $match: match },
			{
				$group: {
					_id: { text: "$elementText", dataTrack: "$dataTrack" },
					count: { $sum: 1 },
					rageCount: { $sum: { $cond: ["$isRageClick", 1, 0] } },
				},
			},
			{ $sort: { count: -1 } },
			{ $limit: 20 },
		])

		return sendResponse(
			res,
			{
				clicks: clicks.map((c: any) => ({
					x: c.x,
					y: c.y,
					viewportW: c.viewportW,
					viewportH: c.viewportH,
					isRageClick: c.isRageClick,
					elementText: c.elementText,
				})),
				topTargets: topTargets.map((t: any) => ({
					text: t._id.text || null,
					dataTrack: t._id.dataTrack || null,
					count: t.count,
					rageCount: t.rageCount,
				})),
				total: clicks.length,
			},
			"Heatmap data retrieved",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Journey Heat] Error:", error)
		return sendResponse(res, null, error.message || "Failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
