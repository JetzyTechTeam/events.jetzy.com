import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { UserSession, PageView } from "@/models/analytics"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

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

		// Parse query params
		let dateFrom: Date | null = null
		let dateTo: Date | null = null

		if (req.query.dateFrom) {
			dateFrom = new Date(req.query.dateFrom as string)
			dateFrom.setHours(0, 0, 0, 0) // Start of day
		}

		if (req.query.dateTo) {
			dateTo = new Date(req.query.dateTo as string)
			dateTo.setHours(23, 59, 59, 999) // End of day
		}

		const groupBy = (req.query.groupBy as string) || "day" // day, week, month

		// Build date filter
		const dateFilter: any = {}
		if (dateFrom) dateFilter.$gte = dateFrom
		if (dateTo) dateFilter.$lte = dateTo

		const matchStage: any = {}
		if (Object.keys(dateFilter).length > 0) {
			matchStage.startTime = dateFilter
		}

		// Group by date format based on groupBy parameter
		let dateFormat: any
		switch (groupBy) {
			case "week":
				dateFormat = { $dateToString: { format: "%Y-W%U", date: "$startTime" } }
				break
			case "month":
				dateFormat = { $dateToString: { format: "%Y-%m", date: "$startTime" } }
				break
			case "day":
			default:
				dateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$startTime" } }
				break
		}

		// Build page view match and date format before parallelising
		const pageViewMatch: any = {}
		if (Object.keys(dateFilter).length > 0) {
			pageViewMatch.timestamp = dateFilter
		}

		let pageViewDateFormat: any
		switch (groupBy) {
			case "week":
				pageViewDateFormat = { $dateToString: { format: "%Y-W%U", date: "$timestamp" } }
				break
			case "month":
				pageViewDateFormat = { $dateToString: { format: "%Y-%m", date: "$timestamp" } }
				break
			case "day":
			default:
				pageViewDateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
				break
		}

		// Aggregate sessions and page views in parallel
		const [sessionsByDate, pageViewsByDate] = await Promise.all([
			UserSession.aggregate([
				{ $match: matchStage },
				{
					$group: {
						_id: dateFormat,
						totalSessions: { $sum: 1 },
						loggedInSessions: {
							$sum: {
								$cond: [{ $eq: ["$isLoggedIn", true] }, 1, 0],
							},
						},
						anonymousSessions: {
							$sum: {
								$cond: [{ $eq: ["$isLoggedIn", false] }, 1, 0],
							},
						},
						uniqueVisitors: { $addToSet: "$sessionId" },
						uniqueLoggedInUsers: {
							$addToSet: {
								$cond: [{ $ne: ["$userId", null] }, "$userId", "$$REMOVE"],
							},
						},
					},
				},
				{
					$project: {
						date: "$_id",
						totalSessions: 1,
						loggedInSessions: 1,
						anonymousSessions: 1,
						uniqueVisitors: { $size: "$uniqueVisitors" },
						uniqueLoggedInUsers: {
							$size: {
								$filter: {
									input: "$uniqueLoggedInUsers",
									cond: { $ne: ["$$this", null] },
								},
							},
						},
					},
				},
				{ $sort: { date: 1 } },
			]),
			PageView.aggregate([
				{ $match: pageViewMatch },
				{
					$group: {
						_id: pageViewDateFormat,
						totalPageViews: { $sum: 1 },
						uniquePages: { $addToSet: "$page" },
					},
				},
				{
					$project: {
						date: "$_id",
						totalPageViews: 1,
						uniquePages: { $size: "$uniquePages" },
					},
				},
				{ $sort: { date: 1 } },
			]),
		])

		// Merge session and page view data
		const dateMap = new Map()
		sessionsByDate.forEach((item) => {
			dateMap.set(item.date, { ...item, totalPageViews: 0, uniquePages: 0 })
		})
		pageViewsByDate.forEach((item) => {
			const existing = dateMap.get(item.date)
			if (existing) {
				existing.totalPageViews = item.totalPageViews
				existing.uniquePages = item.uniquePages
			} else {
				dateMap.set(item.date, {
					date: item.date,
					totalSessions: 0,
					loggedInSessions: 0,
					anonymousSessions: 0,
					uniqueVisitors: 0,
					uniqueLoggedInUsers: 0,
					totalPageViews: item.totalPageViews,
					uniquePages: item.uniquePages,
				})
			}
		})

		const mergedData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))

		// Get totals — run in parallel, avoid distinct() which loads all IDs into memory
		const [
			totalSessions,
			totalLoggedInSessions,
			totalAnonymousSessions,
			uniqueLoggedInResult,
			totalPageViews,
		] = await Promise.all([
			UserSession.countDocuments(matchStage),
			UserSession.countDocuments({ ...matchStage, isLoggedIn: true }),
			UserSession.countDocuments({ ...matchStage, isLoggedIn: false }),
			UserSession.aggregate([
				{ $match: { ...matchStage, userId: { $ne: null } } },
				{ $group: { _id: "$userId" } },
				{ $count: "count" },
			]),
			PageView.countDocuments(pageViewMatch),
		])

		// sessionId is unique per session row, so count == unique count
		const totalUniqueVisitors = totalSessions
		const totalUniqueLoggedInUsers = (uniqueLoggedInResult as any[])[0]?.count || 0

		const response = {
			totals: {
				totalSessions,
				totalLoggedInSessions,
				totalAnonymousSessions,
				totalUniqueVisitors,
				totalUniqueLoggedInUsers,
				totalPageViews,
			},
			byDate: mergedData,
			dateRange: {
				from: dateFrom?.toISOString() || null,
				to: dateTo?.toISOString() || null,
			},
			groupBy,
		}

		return sendResponse(res, response, "Visitor analytics retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Visitors] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch visitor analytics", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

