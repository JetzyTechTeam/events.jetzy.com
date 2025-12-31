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
		const matchFilter: any = {
			referrer: { $exists: true, $nin: [null, ""] },
		}
		if (Object.keys(dateFilter).length > 0) {
			matchFilter.timestamp = dateFilter
		}

		// Aggregate referrers from PageView (get all, then paginate)
		const referrerStatsAll = await PageView.aggregate([
			{ $match: matchFilter },
			{
				$group: {
					_id: "$referrer",
					count: { $sum: 1 },
					uniqueSessions: { $addToSet: "$sessionId" },
					uniqueUsers: { $addToSet: "$userId" },
				},
			},
			{
				$project: {
					referrer: "$_id",
					count: 1,
					uniqueSessionsCount: { $size: "$uniqueSessions" },
					uniqueUsersCount: { $size: { $filter: { input: "$uniqueUsers", as: "user", cond: { $ne: ["$$user", null] } } } },
				},
			},
			{ $sort: { count: -1 } },
		])

		const totalReferrers = referrerStatsAll.length
		const referrerStats = referrerStatsAll.slice(skip, skip + limitNum)

		// Get total page views for percentage calculation (all page views, not just with referrers)
		const totalMatchFilter: any = {}
		if (Object.keys(dateFilter).length > 0) {
			totalMatchFilter.timestamp = dateFilter
		}
		const totalPageViews = await PageView.countDocuments(totalMatchFilter)

		// Process and categorize referrers
		const processedReferrers = referrerStats.map((stat: any) => {
			let category = "other"
			let domain = stat.referrer

			try {
				const url = new URL(stat.referrer)
				domain = url.hostname

				// Categorize by domain
				if (domain.includes("google")) category = "search_engine"
				else if (domain.includes("bing") || domain.includes("yahoo")) category = "search_engine"
				else if (domain.includes("facebook") || domain.includes("fb.com")) category = "social_media"
				else if (domain.includes("twitter") || domain.includes("x.com")) category = "social_media"
				else if (domain.includes("instagram")) category = "social_media"
				else if (domain.includes("linkedin")) category = "social_media"
				else if (stat.referrer.includes("mail.") || stat.referrer.includes("email")) category = "email"
			} catch (e) {
				// Invalid URL, keep as "other"
			}

			return {
				referrer: stat.referrer,
				domain: domain,
				category: category,
				pageViews: stat.count,
				uniqueSessions: stat.uniqueSessionsCount,
				uniqueUsers: stat.uniqueUsersCount,
				percentage: totalPageViews > 0 ? (stat.count / totalPageViews) * 100 : 0,
			}
		})

		// Also get direct traffic count (no referrer)
		const directTrafficCount = await PageView.countDocuments({
			$or: [{ referrer: { $exists: false } }, { referrer: null }, { referrer: "" }],
			...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}),
		})

		// Get sessions with no referrer
		const directSessions = await UserSession.distinct("sessionId", {
			referrer: { $in: [null, ""] },
			...(Object.keys(dateFilter).length > 0 ? { startTime: dateFilter } : {}),
		})

		return sendResponse(
			res,
			{
				referrers: processedReferrers,
				pagination: {
					page: pageNum,
					limit: limitNum,
					total: totalReferrers,
					totalPages: Math.ceil(totalReferrers / limitNum),
					hasNextPage: skip + limitNum < totalReferrers,
					hasPreviousPage: pageNum > 1,
				},
				directTraffic: {
					pageViews: directTrafficCount,
					uniqueSessions: directSessions.length,
					percentage: totalPageViews > 0 ? (directTrafficCount / totalPageViews) * 100 : 0,
				},
				total: totalPageViews,
				dateRange: {
					from: dateFrom || null,
					to: dateTo || null,
				},
			},
			"Referrer analytics retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Analytics Referrers] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch referrer analytics", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

