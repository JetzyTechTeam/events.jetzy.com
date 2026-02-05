import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { PageView, UserSession } from "@/models/analytics"
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

		const { dateFrom, dateTo } = req.query as {
			dateFrom?: string
			dateTo?: string
		}

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

		// Aggregate device types from PageView
		const deviceStats = await PageView.aggregate([
			{ $match: { deviceType: { $exists: true, $ne: null }, ...matchFilter } },
			{
				$group: {
					_id: "$deviceType",
					count: { $sum: 1 },
					uniqueSessions: { $addToSet: "$sessionId" },
					uniqueUsers: { $addToSet: "$userId" },
				},
			},
			{
				$project: {
					deviceType: "$_id",
					count: 1,
					uniqueSessionsCount: { $size: "$uniqueSessions" },
					uniqueUsersCount: { $size: { $filter: { input: "$uniqueUsers", as: "user", cond: { $ne: ["$$user", null] } } } },
				},
			},
			{ $sort: { count: -1 } },
		])

		// Aggregate browser types from PageView
		const browserStats = await PageView.aggregate([
			{ $match: { browserType: { $exists: true, $ne: null }, ...matchFilter } },
			{
				$group: {
					_id: "$browserType",
					count: { $sum: 1 },
					uniqueSessions: { $addToSet: "$sessionId" },
					uniqueUsers: { $addToSet: "$userId" },
				},
			},
			{
				$project: {
					browserType: "$_id",
					count: 1,
					uniqueSessionsCount: { $size: "$uniqueSessions" },
					uniqueUsersCount: { $size: { $filter: { input: "$uniqueUsers", as: "user", cond: { $ne: ["$$user", null] } } } },
				},
			},
			{ $sort: { count: -1 } },
		])

		// Get total page views for percentage calculation
		const totalPageViews = await PageView.countDocuments(matchFilter)

		// Get device stats from UserSession as well
		const sessionDeviceStats = await UserSession.aggregate([
			{ $match: { deviceType: { $exists: true, $ne: null }, ...sessionMatchFilter } },
			{
				$group: {
					_id: "$deviceType",
					count: { $sum: 1 },
					uniqueUsers: { $addToSet: "$userId" },
				},
			},
			{
				$project: {
					deviceType: "$_id",
					sessionCount: "$count",
					uniqueUsersCount: { $size: { $filter: { input: "$uniqueUsers", as: "user", cond: { $ne: ["$$user", null] } } } },
				},
			},
		])

		// Calculate percentages
		const deviceStatsWithPercentage = deviceStats.map((stat: any) => ({
			...stat,
			percentage: totalPageViews > 0 ? (stat.count / totalPageViews) * 100 : 0,
		}))

		const browserStatsWithPercentage = browserStats.map((stat: any) => ({
			...stat,
			percentage: totalPageViews > 0 ? (stat.count / totalPageViews) * 100 : 0,
		}))

		return sendResponse(
			res,
			{
				devices: deviceStatsWithPercentage,
				browsers: browserStatsWithPercentage,
				sessionDevices: sessionDeviceStats,
				total: totalPageViews,
				dateRange: {
					from: dateFrom || null,
					to: dateTo || null,
				},
			},
			"Device and browser analytics retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Analytics Devices] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch device/browser analytics", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

