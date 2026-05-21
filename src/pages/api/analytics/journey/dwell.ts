import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { PageView, WebScroll } from "@/models/analytics"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0
	const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
	return sorted[idx]
}

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

		const { eventId, page, dateFrom, dateTo } = req.query as Record<string, string>

		let pageMatch: any = {}
		let scrollMatch: any = {}

		if (eventId) {
			if (!Types.ObjectId.isValid(eventId)) return sendResponse(res, null, "Invalid eventId", false, ResCode.BAD_REQUEST)
			if (!isAdmin) {
				const ev = await Events.findById(eventId, { ownerId: 1 }).lean()
				if (!ev || (ev as any).ownerId?.toString() !== userId) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)
			}
			scrollMatch.eventId = new Types.ObjectId(eventId)
			pageMatch.page = { $regex: new RegExp(eventId) }
		} else if (!isAdmin) {
			return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)
		}
		if (page) {
			pageMatch.page = page
			scrollMatch.page = page
		}
		if (dateFrom || dateTo) {
			const filter: any = {}
			if (dateFrom) { const d = new Date(dateFrom); d.setHours(0,0,0,0); filter.$gte = d }
			if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); filter.$lte = d }
			pageMatch.timestamp = filter
			scrollMatch.timestamp = filter
		}

		const [byPage, scrollByPage] = await Promise.all([
			PageView.aggregate([
				{ $match: pageMatch },
				{ $group: { _id: "$page", durations: { $push: "$timeSpent" }, count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 50 },
			]),
			WebScroll.aggregate([
				{ $match: scrollMatch },
				{ $group: { _id: "$page", avgDepth: { $avg: "$maxDepthPct" }, count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 50 },
			]),
		])

		const scrollMap = new Map(scrollByPage.map((s: any) => [s._id, s]))

		const pages = byPage.map((p: any) => {
			const durations = (p.durations as number[]).filter((d) => typeof d === "number" && d > 0).sort((a, b) => a - b)
			const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
			const sc = scrollMap.get(p._id)
			return {
				page: p._id,
				views: p.count,
				avgTimeSec: Math.round(avg * 10) / 10,
				p50Sec: percentile(durations, 50),
				p90Sec: percentile(durations, 90),
				avgScrollDepthPct: sc ? Math.round((sc as any).avgDepth * 10) / 10 : null,
			}
		})

		return sendResponse(res, { pages }, "Dwell metrics retrieved", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Journey Dwell] Error:", error)
		return sendResponse(res, null, error.message || "Failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
