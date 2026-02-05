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

		const { dateFrom, dateTo, groupBy = "campaign" } = req.query as {
			dateFrom?: string
			dateTo?: string
			groupBy?: "campaign" | "source" | "medium" | "source_medium"
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

		// Get total for percentage calculation
		const totalPageViews = await PageView.countDocuments(matchFilter)

		let utmStats: any[] = []
		let groupFields: any = {}

		// Build group fields based on groupBy parameter
		switch (groupBy) {
			case "campaign":
				matchFilter.utmCampaign = { $exists: true, $nin: [null, ""] }
				groupFields = {
					campaign: "$utmCampaign",
					source: { $first: "$utmSource" },
					medium: { $first: "$utmMedium" },
				}
				break
			case "source":
				matchFilter.utmSource = { $exists: true, $nin: [null, ""] }
				groupFields = {
					source: "$utmSource",
					medium: { $first: "$utmMedium" },
					campaign: { $first: "$utmCampaign" },
				}
				break
			case "medium":
				matchFilter.utmMedium = { $exists: true, $nin: [null, ""] }
				groupFields = {
					medium: "$utmMedium",
					source: { $first: "$utmSource" },
					campaign: { $first: "$utmCampaign" },
				}
				break
			case "source_medium":
				matchFilter.utmSource = { $exists: true, $nin: [null, ""] }
				matchFilter.utmMedium = { $exists: true, $nin: [null, ""] }
				groupFields = {
					source: "$utmSource",
					medium: "$utmMedium",
					campaign: { $first: "$utmCampaign" },
				}
				break
			default:
				matchFilter.utmCampaign = { $exists: true, $nin: [null, ""] }
				groupFields = {
					campaign: "$utmCampaign",
					source: { $first: "$utmSource" },
					medium: { $first: "$utmMedium" },
				}
		}

		// Aggregate UTM parameters
		utmStats = await PageView.aggregate([
			{ $match: matchFilter },
			{
				$group: {
					_id: groupFields,
					count: { $sum: 1 },
					uniqueSessions: { $addToSet: "$sessionId" },
					uniqueUsers: { $addToSet: "$userId" },
				},
			},
			{
				$project: {
					...groupFields,
					count: 1,
					uniqueSessionsCount: { $size: "$uniqueSessions" },
					uniqueUsersCount: { $size: { $filter: { input: "$uniqueUsers", as: "user", cond: { $ne: ["$$user", null] } } } },
					percentage: totalPageViews > 0 ? { $multiply: [{ $divide: ["$count", totalPageViews] }, 100] } : 0,
				},
			},
			{ $sort: { count: -1 } },
		])

		// Get counts for UTM parameters separately for summary
		const sourceMatchFilter: any = { utmSource: { $exists: true, $nin: [null, ""] } }
		if (Object.keys(dateFilter).length > 0) {
			sourceMatchFilter.timestamp = dateFilter
		}
		const sourceStats = await PageView.aggregate([
			{ $match: sourceMatchFilter },
			{
				$group: {
					_id: "$utmSource",
					count: { $sum: 1 },
				},
			},
			{ $sort: { count: -1 } },
			{ $limit: 10 },
		])

		const mediumMatchFilter: any = { utmMedium: { $exists: true, $nin: [null, ""] } }
		if (Object.keys(dateFilter).length > 0) {
			mediumMatchFilter.timestamp = dateFilter
		}
		const mediumStats = await PageView.aggregate([
			{ $match: mediumMatchFilter },
			{
				$group: {
					_id: "$utmMedium",
					count: { $sum: 1 },
				},
			},
			{ $sort: { count: -1 } },
			{ $limit: 10 },
		])

		const campaignMatchFilter: any = { utmCampaign: { $exists: true, $nin: [null, ""] } }
		if (Object.keys(dateFilter).length > 0) {
			campaignMatchFilter.timestamp = dateFilter
		}
		const campaignStats = await PageView.aggregate([
			{ $match: campaignMatchFilter },
			{
				$group: {
					_id: "$utmCampaign",
					count: { $sum: 1 },
				},
			},
			{ $sort: { count: -1 } },
			{ $limit: 10 },
		])

		return sendResponse(
			res,
			{
				grouped: utmStats,
				summary: {
					sources: sourceStats.map((s: any) => ({ source: s._id, count: s.count })),
					mediums: mediumStats.map((m: any) => ({ medium: m._id, count: m.count })),
					campaigns: campaignStats.map((c: any) => ({ campaign: c._id, count: c.count })),
				},
				total: totalPageViews,
				groupBy,
				dateRange: {
					from: dateFrom || null,
					to: dateTo || null,
				},
			},
			"UTM analytics retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Analytics UTM] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch UTM analytics", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

