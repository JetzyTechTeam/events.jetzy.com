import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Users } from "@/models/userModal"
import { UserSession, PageView, UserAction, EventInteraction } from "@/models/analytics"
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

		const { limit = "10", page = "1", sortBy = "activity", dateFrom, dateTo } = req.query as {
			limit?: string
			page?: string
			sortBy?: "activity" | "sessions" | "pageViews" | "recentActivity"
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

		// Build match filter for analytics data
		const analyticsMatch: any = {}
		if (Object.keys(dateFilter).length > 0) {
			analyticsMatch.timestamp = dateFilter
		}

		// Run all data fetches in parallel
		const [allUsers, sessionsByUser, pageViewsByUser, actionsByUser, eventInteractionsByUser] = await Promise.all([
			Users.find({}).select("_id firstName lastName email role lastActiveAt createdAt").lean(),
			UserSession.aggregate([
				{ $match: { userId: { $exists: true, $ne: null }, ...(Object.keys(analyticsMatch).length > 0 ? { startTime: dateFilter } : {}) } },
				{
					$group: {
						_id: "$userId",
						totalSessions: { $sum: 1 },
						totalDuration: { $sum: "$duration" },
						lastSessionStart: { $max: "$startTime" },
					},
				},
			]),
			PageView.aggregate([
				{ $match: { userId: { $exists: true, $ne: null }, ...(Object.keys(analyticsMatch).length > 0 ? analyticsMatch : {}) } },
				{
					$group: {
						_id: "$userId",
						totalPageViews: { $sum: 1 },
						uniquePages: { $addToSet: "$page" },
						lastPageView: { $max: "$timestamp" },
					},
				},
			]),
			UserAction.aggregate([
				{ $match: { userId: { $exists: true, $ne: null }, ...(Object.keys(analyticsMatch).length > 0 ? analyticsMatch : {}) } },
				{
					$group: {
						_id: "$userId",
						totalActions: { $sum: 1 },
						actionTypes: { $addToSet: "$actionType" },
					},
				},
			]),
			EventInteraction.aggregate([
				{ $match: { userId: { $exists: true, $ne: null }, ...(Object.keys(analyticsMatch).length > 0 ? analyticsMatch : {}) } },
				{
					$group: {
						_id: "$userId",
						totalInteractions: { $sum: 1 },
						uniqueEvents: { $addToSet: "$eventId" },
					},
				},
			]),
		])

		// Create maps for quick lookup
		const sessionsMap = new Map(sessionsByUser.map((item) => [item._id.toString(), item]))
		const pageViewsMap = new Map(
			pageViewsByUser.map((item) => [
				item._id.toString(),
				{ ...item, uniquePagesCount: item.uniquePages.length },
			])
		)
		const actionsMap = new Map(actionsByUser.map((item) => [item._id.toString(), item]))
		const interactionsMap = new Map(
			eventInteractionsByUser.map((item) => [
				item._id.toString(),
				{ ...item, uniqueEventsCount: item.uniqueEvents.filter((id: any) => id).length },
			])
		)

		// Combine data for all users
		const usersWithStats = allUsers.map((user: any) => {
			const userId = user._id.toString()
			const sessionData = sessionsMap.get(userId) || {
				totalSessions: 0,
				totalDuration: 0,
				lastSessionStart: null,
			}
			const pageViewData = pageViewsMap.get(userId) || {
				totalPageViews: 0,
				uniquePagesCount: 0,
				lastPageView: null,
			}
			const actionData = actionsMap.get(userId) || {
				totalActions: 0,
				actionTypes: [],
			}
			const interactionData = interactionsMap.get(userId) || {
				totalInteractions: 0,
				uniqueEventsCount: 0,
			}

			// Calculate activity score (weighted combination of metrics)
			const activityScore =
				sessionData.totalSessions * 10 +
				pageViewData.totalPageViews * 2 +
				actionData.totalActions * 5 +
				interactionData.totalInteractions * 3

			return {
				userId: userId,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				role: user.role,
				lastActiveAt: user.lastActiveAt,
				createdAt: user.createdAt,
				stats: {
					sessions: sessionData.totalSessions,
					avgSessionDuration: sessionData.totalSessions > 0 ? Math.round(sessionData.totalDuration / sessionData.totalSessions) : 0,
					pageViews: pageViewData.totalPageViews,
					uniquePages: pageViewData.uniquePagesCount,
					actions: actionData.totalActions,
					eventInteractions: interactionData.totalInteractions,
					uniqueEvents: interactionData.uniqueEventsCount,
					activityScore: activityScore,
				},
				lastActivity: sessionData.lastSessionStart || pageViewData.lastPageView || user.lastActiveAt || user.createdAt,
			}
		})

		// Sort based on sortBy parameter
		let sortedUsers = [...usersWithStats]
		switch (sortBy) {
			case "activity":
				sortedUsers.sort((a, b) => b.stats.activityScore - a.stats.activityScore)
				break
			case "sessions":
				sortedUsers.sort((a, b) => b.stats.sessions - a.stats.sessions)
				break
			case "pageViews":
				sortedUsers.sort((a, b) => b.stats.pageViews - a.stats.pageViews)
				break
			case "recentActivity":
				sortedUsers.sort((a, b) => {
					const aDate = new Date(a.lastActivity).getTime()
					const bDate = new Date(b.lastActivity).getTime()
					return bDate - aDate
				})
				break
			default:
				sortedUsers.sort((a, b) => b.stats.activityScore - a.stats.activityScore)
		}

		// Apply pagination
		const total = sortedUsers.length
		const paginatedUsers = sortedUsers.slice(skip, skip + limitNum)

		return sendResponse(
			res,
			{
				users: paginatedUsers,
				pagination: {
					page: pageNum,
					limit: limitNum,
					total: total,
					totalPages: Math.ceil(total / limitNum),
					hasNextPage: skip + limitNum < total,
					hasPreviousPage: pageNum > 1,
				},
				sortBy,
				dateRange: {
					from: dateFrom || null,
					to: dateTo || null,
				},
			},
			"Top users retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Analytics Top Users] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch top users", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

