import { sendResponse } from "@Jetzy/lib/helpers"
import { eventPath } from "@/lib/event-slug"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { Bookings as BookingsModel } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { CheckIn } from "@/models/checkIn"
import { EventInteraction, PageView, UserSession } from "@/models/analytics"
import { AlbumAccess } from "@/models/events/album-access"
import { EventAlbums } from "@/models/events/albums"
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
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId, dateFrom, dateTo, page = "1", limit = "20", groupBy = "day" } = req.query as {
			eventId?: string
			dateFrom?: string
			dateTo?: string
			page?: string
			limit?: string
			groupBy?: "day" | "week" | "month"
		}

		if (!eventId) {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		// Validate eventId
		if (!Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Invalid event ID", false, ResCode.BAD_REQUEST)
		}

		// Non-admin must be the event owner to access analytics
		if (!isAdmin) {
			const event = await Events.findById(eventId, { ownerId: 1 }).lean()
			if (!event || (event as any).ownerId?.toString() !== userId) {
				return sendResponse(res, null, "Access denied. You can only view analytics for your own events.", false, ResCode.FORBIDDEN)
			}
		}

		const eventObjectId = new Types.ObjectId(eventId)

		// Verify event exists
		const event = await Events.findOne({ _id: eventObjectId, isDeleted: false })
			.select("_id name slug images startsOn endsOn isPaid privacy capacity")
			.lean()

		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Parse pagination
		const pageNum = parseInt(page, 10)
		const limitNum = parseInt(limit, 10)
		if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
			return sendResponse(res, null, "Invalid pagination parameters", false, ResCode.BAD_REQUEST)
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

		// Build match filter for bookings
		const bookingMatch: any = { eventId: eventObjectId, isDeleted: false, status: BookingStatus.CONFIRMED }
		if (Object.keys(dateFilter).length > 0) {
			bookingMatch.createdAt = dateFilter
		}

		// 1. Get booking stats
		const bookingStats = await BookingsModel.aggregate([
			{ $match: bookingMatch },
			{
				$group: {
					_id: null,
					totalRevenue: { $sum: "$total" },
					totalDiscounts: { $sum: "$discountAmount" },
					bookingCount: { $sum: 1 },
					totalTickets: {
						$sum: {
							$reduce: {
								input: "$tickets",
								initialValue: 0,
								in: { $add: ["$$value", "$$this.quantity"] },
							},
						},
					},
				},
			},
		])

		const bookings = bookingStats[0] || {
			totalRevenue: 0,
			totalDiscounts: 0,
			bookingCount: 0,
			totalTickets: 0,
		}

		// 2. Get check-in stats
		const checkInMatch: any = { eventId: eventObjectId }
		if (Object.keys(dateFilter).length > 0) {
			checkInMatch.createdAt = dateFilter
		}

		const checkInStats = await CheckIn.aggregate([
			{ $match: checkInMatch },
			{
				$group: {
					_id: null,
					totalCheckedIn: { $sum: "$checkedInCount" },
				},
			},
		])

		const checkIns = checkInStats[0] || { totalCheckedIn: 0 }

		// 3. Get event interaction stats
		const interactionMatch: any = { eventId: eventObjectId }
		if (Object.keys(dateFilter).length > 0) {
			interactionMatch.timestamp = dateFilter
		}

		const interactionStats = await EventInteraction.aggregate([
			{ $match: interactionMatch },
			{
				$group: {
					_id: "$interactionType",
					count: { $sum: 1 },
					uniqueUsers: { $addToSet: "$sessionId" },
				},
			},
		])

		const interactions: Record<string, { count: number; uniqueUsers: number }> = {}
		interactionStats.forEach((stat) => {
			interactions[stat._id] = {
				count: stat.count,
				uniqueUsers: stat.uniqueUsers.length,
			}
		})

		const views = interactions.view || { count: 0, uniqueUsers: 0 }
		const shares = interactions.share || { count: 0, uniqueUsers: 0 }
		const bookingStarts = interactions.booking_start || { count: 0, uniqueUsers: 0 }

		// 4. Get bookings over time (for chart)
		let bookingDateFormat: any
		switch (groupBy) {
			case "week":
				bookingDateFormat = { $dateToString: { format: "%Y-W%U", date: "$createdAt" } }
				break
			case "month":
				bookingDateFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } }
				break
			default:
				bookingDateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
		}

		const bookingsOverTime = await BookingsModel.aggregate([
			{ $match: bookingMatch },
			{
				$group: {
					_id: bookingDateFormat,
					revenue: { $sum: "$total" },
					bookings: { $sum: 1 },
					tickets: {
						$sum: {
							$reduce: {
								input: "$tickets",
								initialValue: 0,
								in: { $add: ["$$value", "$$this.quantity"] },
							},
						},
					},
				},
			},
			{ $sort: { _id: 1 } },
		])

		// 5. Get views over time
		let viewsDateFormat: any
		switch (groupBy) {
			case "week":
				viewsDateFormat = { $dateToString: { format: "%Y-W%U", date: "$timestamp" } }
				break
			case "month":
				viewsDateFormat = { $dateToString: { format: "%Y-%m", date: "$timestamp" } }
				break
			default:
				viewsDateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
		}

		const viewsOverTime = await EventInteraction.aggregate([
			{ $match: { eventId: eventObjectId, interactionType: "view", ...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}) } },
			{
				$group: {
					_id: viewsDateFormat,
					views: { $sum: 1 },
					uniqueViewers: { $addToSet: "$sessionId" },
				},
			},
			{
				$project: {
					date: "$_id",
					views: 1,
					uniqueViewers: { $size: "$uniqueViewers" },
				},
			},
			{ $sort: { date: 1 } },
		])

		// 6. Get traffic sources (referrers) for this event's page views
		// Encoded: the browser records the percent-encoded path in PageView.page, so a
		// raw slug with a space would never match and the event would report zero views.
		const eventPagePath = eventPath(event.slug)
		const referrerMatch: any = { page: eventPagePath, referrer: { $exists: true, $nin: [null, ""] } }
		if (Object.keys(dateFilter).length > 0) {
			referrerMatch.timestamp = dateFilter
		}

		const referrerStats = await PageView.aggregate([
			{ $match: referrerMatch },
			{
				$group: {
					_id: "$referrer",
					count: { $sum: 1 },
					uniqueSessions: { $addToSet: "$sessionId" },
				},
			},
			{
				$project: {
					referrer: "$_id",
					count: 1,
					uniqueSessionsCount: { $size: "$uniqueSessions" },
				},
			},
			{ $sort: { count: -1 } },
			{ $limit: 10 },
		])

		const totalPageViewsForEvent = await PageView.countDocuments({
			page: eventPagePath,
			...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}),
		})

		// Process referrers
		const processedReferrers = referrerStats.map((stat: any) => {
			let category = "other"
			let domain = stat.referrer

			try {
				const url = new URL(stat.referrer)
				domain = url.hostname

				if (domain.includes("google") || domain.includes("bing") || domain.includes("yahoo")) category = "search_engine"
				else if (domain.includes("facebook") || domain.includes("fb.com") || domain.includes("twitter") || domain.includes("x.com") || domain.includes("instagram") || domain.includes("linkedin")) category = "social_media"
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
				percentage: totalPageViewsForEvent > 0 ? (stat.count / totalPageViewsForEvent) * 100 : 0,
			}
		})

		// 7. Get device breakdown for event page views
		const deviceStatsRaw = await PageView.aggregate([
			{
				$match: {
					page: eventPagePath,
					deviceType: { $exists: true, $ne: null },
					...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}),
				},
			},
			{
				$group: {
					_id: "$deviceType",
					count: { $sum: 1 },
					uniqueSessions: { $addToSet: "$sessionId" },
				},
			},
			{
				$project: {
					deviceType: "$_id",
					count: 1,
					uniqueSessionsCount: { $size: "$uniqueSessions" },
				},
			},
			{ $sort: { count: -1 } },
		])

		// Calculate percentages in JavaScript after aggregation
		const deviceStats = deviceStatsRaw.map((stat: any) => ({
			deviceType: stat.deviceType,
			count: stat.count,
			uniqueSessionsCount: stat.uniqueSessionsCount,
			percentage: totalPageViewsForEvent > 0 ? (stat.count / totalPageViewsForEvent) * 100 : 0,
		}))

		// 8. Get recent interactions (paginated)
		const recentInteractions = await EventInteraction.find({
			eventId: eventObjectId,
			...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}),
		})
			.sort({ timestamp: -1 })
			.skip(skip)
			.limit(limitNum)
			.lean()

		const totalInteractions = await EventInteraction.countDocuments({
			eventId: eventObjectId,
			...(Object.keys(dateFilter).length > 0 ? { timestamp: dateFilter } : {}),
		})

		const formattedInteractions = recentInteractions.map((interaction: any) => ({
			_id: interaction._id.toString(),
			interactionType: interaction.interactionType,
			timestamp: interaction.timestamp,
			userId: interaction.userId?.toString() || null,
			sessionId: interaction.sessionId,
			metadata: interaction.metadata || null,
		}))

		// 9. Album access analytics — how many users reached shared albums, login vs signup
		const albumAccessMatch: any = { eventId: eventObjectId }
		if (Object.keys(dateFilter).length > 0) {
			albumAccessMatch.createdAt = dateFilter
		}

		const [albumActionStats, albumUniqueViewers, albumVerifiedViewers, albumCount, perAlbumStats] = await Promise.all([
			AlbumAccess.aggregate([
				{ $match: albumAccessMatch },
				{ $group: { _id: "$action", count: { $sum: 1 } } },
			]),
			AlbumAccess.aggregate([
				{ $match: albumAccessMatch },
				// Keyed on email, not userId — guest viewers may have no linked account.
				{ $group: { _id: "$viewerEmail" } },
				{ $count: "count" },
			]),
			// Viewers who proved their email. Rows written before the code gate have no
			// `verified` field, so they correctly fall outside this count.
			AlbumAccess.aggregate([
				{ $match: { ...albumAccessMatch, verified: true } },
				{ $group: { _id: "$viewerEmail" } },
				{ $count: "count" },
			]),
			EventAlbums.countDocuments({ eventId: eventObjectId, isDeleted: false }),
			AlbumAccess.aggregate([
				{ $match: albumAccessMatch },
				{ $group: { _id: "$albumId", accesses: { $sum: 1 }, users: { $addToSet: "$viewerEmail" } } },
				{ $sort: { accesses: -1 } },
				{ $limit: 10 },
				{
					$lookup: {
						from: "event-albums",
						localField: "_id",
						foreignField: "_id",
						as: "album",
					},
				},
				{
					$project: {
						albumId: "$_id",
						accesses: 1,
						uniqueViewers: { $size: "$users" },
						title: { $ifNull: [{ $arrayElemAt: ["$album.title", 0] }, "Untitled"] },
					},
				},
			]),
		])

		let albumLogins = 0
		let albumSignups = 0
		albumActionStats.forEach((s: any) => {
			if (s._id === "login") albumLogins = s.count
			else if (s._id === "signup") albumSignups = s.count
		})
		const albumTotalAccesses = albumLogins + albumSignups
		const albumUniqueCount = albumUniqueViewers[0]?.count || 0
		const albumVerifiedCount = albumVerifiedViewers[0]?.count || 0

		// Calculate conversion rates
		const viewToBookingRate = views.count > 0 ? (bookings.bookingCount / views.count) * 100 : 0
		const viewToCheckInRate = checkIns.totalCheckedIn > 0 && bookings.totalTickets > 0 ? (checkIns.totalCheckedIn / bookings.totalTickets) * 100 : 0
		const checkInRate = bookings.totalTickets > 0 ? (checkIns.totalCheckedIn / bookings.totalTickets) * 100 : 0

		return sendResponse(
			res,
			{
				event: {
					_id: event._id.toString(),
					name: event.name,
					slug: event.slug,
					image: event.images?.[0] || null,
					startsOn: event.startsOn,
					endsOn: event.endsOn,
					isPaid: event.isPaid,
					privacy: event.privacy,
					capacity: event.capacity,
				},
				summary: {
					views: views.count,
					uniqueViewers: views.uniqueUsers,
					bookings: bookings.bookingCount,
					revenue: {
						total: bookings.totalRevenue,
						net: bookings.totalRevenue - bookings.totalDiscounts,
						discounts: bookings.totalDiscounts,
						averagePerBooking: bookings.bookingCount > 0 ? bookings.totalRevenue / bookings.bookingCount : 0,
					},
					tickets: {
						sold: bookings.totalTickets,
						checkedIn: checkIns.totalCheckedIn,
						checkInRate: checkInRate,
					},
					interactions: {
						views: views.count,
						shares: shares.count,
						bookingStarts: bookingStarts.count,
					},
					conversionRates: {
						viewToBooking: viewToBookingRate,
						viewToCheckIn: viewToCheckInRate,
					},
				},
				albums: {
					albumCount,
					totalAccesses: albumTotalAccesses,
					uniqueViewers: albumUniqueCount,
					verifiedViewers: albumVerifiedCount,
					logins: albumLogins,
					signups: albumSignups,
					perAlbum: perAlbumStats.map((a: any) => ({
						albumId: a.albumId?.toString(),
						title: a.title,
						accesses: a.accesses,
						uniqueViewers: a.uniqueViewers,
					})),
				},
				trends: {
					bookings: bookingsOverTime.map((item: any) => ({
						date: item._id,
						revenue: item.revenue,
						bookings: item.bookings,
						tickets: item.tickets,
					})),
					views: viewsOverTime,
				},
				trafficSources: {
					referrers: processedReferrers,
					directTraffic: {
						pageViews: totalPageViewsForEvent - referrerStats.reduce((sum: number, r: any) => sum + r.count, 0),
						percentage:
							totalPageViewsForEvent > 0
								? ((totalPageViewsForEvent - referrerStats.reduce((sum: number, r: any) => sum + r.count, 0)) / totalPageViewsForEvent) * 100
								: 0,
					},
					totalPageViews: totalPageViewsForEvent,
				},
				devices: deviceStats,
				recentInteractions: {
					items: formattedInteractions,
					pagination: {
						page: pageNum,
						limit: limitNum,
						total: totalInteractions,
						totalPages: Math.ceil(totalInteractions / limitNum),
						hasNextPage: pageNum * limitNum < totalInteractions,
						hasPreviousPage: pageNum > 1,
					},
				},
				dateRange: {
					from: dateFrom || null,
					to: dateTo || null,
				},
			},
			"Event analytics retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Analytics Events] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch event analytics", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

