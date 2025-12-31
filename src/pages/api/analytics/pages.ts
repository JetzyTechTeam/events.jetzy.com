import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { PageView, UserSession } from "@/models/analytics"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		if (!isAdmin) {
			return sendResponse(res, null, "Forbidden - Admin access required", false, ResCode.FORBIDDEN)
		}

		const { limit = "20", page = "1", dateFrom, dateTo } = req.query as {
			limit?: string
			page?: string
			dateFrom?: string
			dateTo?: string
		}

		const limitNum = parseInt(limit, 10)
		const pageNum = parseInt(page, 10)
		if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
			return sendResponse(res, null, "Invalid limit (1-100)", false, ResCode.BAD_REQUEST)
		}
		if (isNaN(pageNum) || pageNum < 1) {
			return sendResponse(res, null, "Invalid page (must be >= 1)", false, ResCode.BAD_REQUEST)
		}
		const skip = (pageNum - 1) * limitNum

		// Build date filter
		const dateFilter: any = {}
		if (dateFrom) {
			const fromDate = new Date(dateFrom)
			fromDate.setHours(0, 0, 0, 0) // Start of day
			dateFilter.$gte = fromDate
		}
		if (dateTo) {
			const toDate = new Date(dateTo)
			toDate.setHours(23, 59, 59, 999) // End of day
			dateFilter.$lte = toDate
		}

		// Build match filter
		const matchFilter: any = {}
		if (Object.keys(dateFilter).length > 0) {
			matchFilter.timestamp = dateFilter
		}

		const sessionMatchFilter: any = {}
		if (Object.keys(dateFilter).length > 0) {
			sessionMatchFilter.startTime = dateFilter
		}

		// Get entry pages (from UserSession entryPage field) - get all then paginate
		const entryPagesAll = await UserSession.aggregate([
			{ $match: { entryPage: { $exists: true, $ne: null }, ...sessionMatchFilter } },
			{
				$group: {
					_id: "$entryPage",
					count: { $sum: 1 },
					uniqueSessions: { $addToSet: "$sessionId" },
					uniqueUsers: { $addToSet: "$userId" },
				},
			},
			{
				$project: {
					page: "$_id",
					count: 1,
					uniqueSessionsCount: { $size: "$uniqueSessions" },
					uniqueUsersCount: { $size: { $filter: { input: "$uniqueUsers", as: "user", cond: { $ne: ["$$user", null] } } } },
				},
			},
			{ $sort: { count: -1 } },
		])

		// Get exit pages (optimized: use UserSession.exitPage field instead of expensive PageView aggregation)
		// This is much faster because UserSession collection is smaller and we can use indexed fields
		const exitPagesAll = await UserSession.aggregate([
			{ $match: { exitPage: { $exists: true, $ne: null }, ...sessionMatchFilter } },
			{
				$group: {
					_id: "$exitPage",
					count: { $sum: 1 },
					uniqueSessions: { $addToSet: "$sessionId" },
				},
			},
			{
				$project: {
					page: "$_id",
					count: 1,
					uniqueSessionsCount: { $size: "$uniqueSessions" },
				},
			},
			{ $sort: { count: -1 } },
		])

		// Get most viewed pages - get all then paginate
		const mostViewedPagesAll = await PageView.aggregate([
			{ $match: matchFilter },
			{
				$group: {
					_id: "$page",
					count: { $sum: 1 },
					uniqueSessions: { $addToSet: "$sessionId" },
					uniqueUsers: { $addToSet: "$userId" },
					avgTimeSpent: { $avg: "$timeSpent" },
				},
			},
			{
				$project: {
					page: "$_id",
					count: 1,
					uniqueSessionsCount: { $size: "$uniqueSessions" },
					uniqueUsersCount: { $size: { $filter: { input: "$uniqueUsers", as: "user", cond: { $ne: ["$$user", null] } } } },
					avgTimeSpent: 1,
				},
			},
			{ $sort: { count: -1 } },
		])

		// Apply pagination - each page type has its own pagination
		const totalEntryPages = entryPagesAll.length
		const totalExitPages = exitPagesAll.length
		const totalMostViewedPages = mostViewedPagesAll.length

		const entryPages = entryPagesAll.slice(skip, skip + limitNum)
		const exitPages = exitPagesAll.slice(skip, skip + limitNum)
		const mostViewedPages = mostViewedPagesAll.slice(skip, skip + limitNum)

		// Get total sessions for percentage calculation
		const totalSessions = await UserSession.countDocuments(sessionMatchFilter)
		const totalPageViews = await PageView.countDocuments(matchFilter)

		// Calculate percentages
		const entryPagesWithPercentage = entryPages.map((stat: any) => ({
			...stat,
			percentage: totalSessions > 0 ? (stat.count / totalSessions) * 100 : 0,
		}))

		const exitPagesWithPercentage = exitPages.map((stat: any) => ({
			...stat,
			percentage: totalSessions > 0 ? (stat.count / totalSessions) * 100 : 0,
		}))

		const mostViewedPagesWithPercentage = mostViewedPages.map((stat: any) => ({
			...stat,
			percentage: totalPageViews > 0 ? (stat.count / totalPageViews) * 100 : 0,
		}))

		return sendResponse(
			res,
			{
				entryPages: entryPagesWithPercentage,
				exitPages: exitPagesWithPercentage,
				mostViewedPages: mostViewedPagesWithPercentage,
				pagination: {
					entryPages: {
						page: pageNum,
						limit: limitNum,
						total: totalEntryPages,
						totalPages: Math.ceil(totalEntryPages / limitNum),
						hasNextPage: skip + limitNum < totalEntryPages,
						hasPreviousPage: pageNum > 1,
					},
					exitPages: {
						page: pageNum,
						limit: limitNum,
						total: totalExitPages,
						totalPages: Math.ceil(totalExitPages / limitNum),
						hasNextPage: skip + limitNum < totalExitPages,
						hasPreviousPage: pageNum > 1,
					},
					mostViewedPages: {
						page: pageNum,
						limit: limitNum,
						total: totalMostViewedPages,
						totalPages: Math.ceil(totalMostViewedPages / limitNum),
						hasNextPage: skip + limitNum < totalMostViewedPages,
						hasPreviousPage: pageNum > 1,
					},
				},
				totals: {
					sessions: totalSessions,
					pageViews: totalPageViews,
				},
				dateRange: {
					from: dateFrom || null,
					to: dateTo || null,
				},
			},
			"Page analytics retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Analytics Pages] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch page analytics", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

