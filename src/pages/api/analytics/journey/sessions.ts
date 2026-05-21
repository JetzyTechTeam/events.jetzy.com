import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { UserSession, PageView, WebClick } from "@/models/analytics"
import { Users } from "@/models/userModal"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"

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
		if (!isAdmin) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)

		const { page = "1", limit = "20", dateFrom, dateTo, isLoggedIn, deviceType } = req.query as Record<string, string>

		const pageNum = Math.max(1, parseInt(page, 10) || 1)
		const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
		const skip = (pageNum - 1) * limitNum

		const query: any = {}
		if (isLoggedIn === "true") query.isLoggedIn = true
		if (isLoggedIn === "false") query.isLoggedIn = false
		if (deviceType) query.deviceType = deviceType
		if (dateFrom || dateTo) {
			query.startTime = {}
			if (dateFrom) {
				const d = new Date(dateFrom); d.setHours(0, 0, 0, 0)
				query.startTime.$gte = d
			}
			if (dateTo) {
				const d = new Date(dateTo); d.setHours(23, 59, 59, 999)
				query.startTime.$lte = d
			}
		}

		const [sessions, total] = await Promise.all([
			UserSession.find(query).sort({ startTime: -1 }).skip(skip).limit(limitNum).lean(),
			UserSession.countDocuments(query),
		])

		const sessionIds = sessions.map((s: any) => s.sessionId)
		const userIds = sessions.map((s: any) => s.userId).filter(Boolean)

		const [users, clickCounts, pageCounts] = await Promise.all([
			userIds.length ? Users.find({ _id: { $in: userIds } }, { email: 1, firstName: 1, lastName: 1 }).lean() : [],
			WebClick.aggregate([
				{ $match: { sessionId: { $in: sessionIds } } },
				{ $group: { _id: "$sessionId", count: { $sum: 1 } } },
			]),
			PageView.aggregate([
				{ $match: { sessionId: { $in: sessionIds } } },
				{ $group: { _id: "$sessionId", count: { $sum: 1 } } },
			]),
		])

		const userMap = new Map(users.map((u: any) => [u._id.toString(), u]))
		const clickMap = new Map(clickCounts.map((c: any) => [c._id, c.count]))
		const pageMap = new Map(pageCounts.map((p: any) => [p._id, p.count]))

		const rows = sessions.map((s: any) => {
			const user = s.userId ? userMap.get(s.userId.toString()) : null
			return {
				sessionId: s.sessionId,
				userId: s.userId?.toString() || null,
				userEmail: (user as any)?.email || null,
				userName: user ? `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() : null,
				anonId: s.anonId || null,
				isLoggedIn: s.isLoggedIn,
				entryPage: s.entryPage,
				exitPage: s.exitPage || null,
				deviceType: s.deviceType || null,
				referrer: s.referrer || null,
				startTime: s.startTime,
				endTime: s.endTime || null,
				duration: s.duration || null,
				pageCount: pageMap.get(s.sessionId) || s.pageCount || 0,
				clickCount: clickMap.get(s.sessionId) || 0,
			}
		})

		return sendResponse(
			res,
			{ sessions: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
			"Sessions retrieved",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Journey Sessions] Error:", error)
		return sendResponse(res, null, error.message || "Failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
