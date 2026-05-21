import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { UserSession } from "@/models/analytics"
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

		const { dateFrom, dateTo } = req.query as Record<string, string>

		const dateFilter: any = {}
		if (dateFrom) { const d = new Date(dateFrom); d.setHours(0,0,0,0); dateFilter.$gte = d }
		if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); dateFilter.$lte = d }
		const baseMatch: any = {}
		if (Object.keys(dateFilter).length) baseMatch.startTime = dateFilter

		const [totals, byAnon, byEntry] = await Promise.all([
			UserSession.aggregate([
				{ $match: baseMatch },
				{
					$group: {
						_id: "$isLoggedIn",
						sessions: { $sum: 1 },
						uniqueUsers: { $addToSet: { $ifNull: ["$userId", "$anonId"] } },
						avgDuration: { $avg: "$duration" },
						avgPages: { $avg: "$pageCount" },
					},
				},
			]),
			UserSession.aggregate([
				{ $match: { ...baseMatch, isLoggedIn: false, anonId: { $ne: null } } },
				{
					$group: {
						_id: "$anonId",
						sessions: { $sum: 1 },
						firstSeen: { $min: "$startTime" },
						lastSeen: { $max: "$startTime" },
					},
				},
				{ $sort: { sessions: -1 } },
				{ $limit: 100 },
			]),
			UserSession.aggregate([
				{ $match: { ...baseMatch, isLoggedIn: false } },
				{ $group: { _id: "$entryPage", count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 20 },
			]),
		])

		const guestRow = totals.find((t: any) => t._id === false) || { sessions: 0, uniqueUsers: [], avgDuration: 0, avgPages: 0 }
		const authRow = totals.find((t: any) => t._id === true) || { sessions: 0, uniqueUsers: [], avgDuration: 0, avgPages: 0 }

		const anonIds = byAnon.map((a: any) => a._id)
		const conversions = anonIds.length
			? await UserSession.countDocuments({ anonId: { $in: anonIds }, isLoggedIn: true, ...(Object.keys(dateFilter).length ? { startTime: dateFilter } : {}) })
			: 0

		return sendResponse(
			res,
			{
				totals: {
					guest: {
						sessions: guestRow.sessions,
						uniqueVisitors: guestRow.uniqueUsers.length,
						avgDurationSec: Math.round(((guestRow.avgDuration || 0) as number) * 10) / 10,
						avgPages: Math.round(((guestRow.avgPages || 0) as number) * 10) / 10,
					},
					auth: {
						sessions: authRow.sessions,
						uniqueUsers: authRow.uniqueUsers.length,
						avgDurationSec: Math.round(((authRow.avgDuration || 0) as number) * 10) / 10,
						avgPages: Math.round(((authRow.avgPages || 0) as number) * 10) / 10,
					},
				},
				guestToAuthConversionPct:
					byAnon.length > 0 ? Math.round((conversions / byAnon.length) * 1000) / 10 : 0,
				topGuests: byAnon.map((a: any) => ({
					anonId: a._id,
					sessions: a.sessions,
					firstSeen: a.firstSeen,
					lastSeen: a.lastSeen,
				})),
				topEntryPages: byEntry.map((e: any) => ({ page: e._id, count: e.count })),
			},
			"Guest analytics retrieved",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Journey Guests] Error:", error)
		return sendResponse(res, null, error.message || "Failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
