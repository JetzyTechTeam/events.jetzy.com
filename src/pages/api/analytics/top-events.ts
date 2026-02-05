import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { Bookings as BookingsModel } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { CheckIn } from "@/models/checkIn"
import { EventInteraction } from "@/models/analytics"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

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

		const { limit = "10", page = "1", sortBy = "revenue", dateFrom, dateTo } = req.query as {
			limit?: string
			page?: string
			sortBy?: "revenue" | "bookings" | "attendance" | "views"
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

		// Get all events
		const allEvents = await Events.find({ isDeleted: false }).select("_id name slug images").lean()

		// Build match filter for bookings
		const bookingMatch: any = { isDeleted: false, status: BookingStatus.CONFIRMED }
		if (Object.keys(dateFilter).length > 0) {
			bookingMatch.createdAt = dateFilter
		}

		// Aggregate revenue and bookings by event
		const revenueByEvent = await BookingsModel.aggregate([
			{ $match: bookingMatch },
			{
				$group: {
					_id: "$eventId",
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

		// Get check-ins by event
		const checkInMatch: any = {}
		if (Object.keys(dateFilter).length > 0) {
			checkInMatch.createdAt = dateFilter
		}
		const checkInsByEvent = await CheckIn.aggregate([
			{ $match: checkInMatch },
			{
				$group: {
					_id: "$eventId",
					totalCheckedIn: { $sum: "$checkedInCount" },
				},
			},
		])

		// Get event views/interactions
		const viewMatch: any = { interactionType: "view" }
		if (Object.keys(dateFilter).length > 0) {
			viewMatch.timestamp = dateFilter
		}
		const viewsByEvent = await EventInteraction.aggregate([
			{ $match: viewMatch },
			{
				$group: {
					_id: "$eventId",
					viewCount: { $sum: 1 },
					uniqueViewers: { $addToSet: "$userId" },
				},
			},
		])

		// Create maps for quick lookup
		const revenueMap = new Map(revenueByEvent.map((item) => [item._id.toString(), item]))
		const checkInMap = new Map(checkInsByEvent.map((item) => [item._id.toString(), item.totalCheckedIn]))
		const viewsMap = new Map(
			viewsByEvent.map((item) => [
				item._id.toString(),
				{ views: item.viewCount, uniqueViewers: item.uniqueViewers.filter((id: any) => id).length },
			])
		)

		// Combine data for all events
		const eventsWithStats = allEvents.map((event: any) => {
			const eventId = event._id.toString()
			const revenueData = revenueMap.get(eventId) || {
				totalRevenue: 0,
				totalDiscounts: 0,
				bookingCount: 0,
				totalTickets: 0,
			}
			const checkedIn = checkInMap.get(eventId) || 0
			const viewsData = viewsMap.get(eventId) || { views: 0, uniqueViewers: 0 }

			return {
				eventId: eventId,
				name: event.name,
				slug: event.slug,
				image: event.images?.[0] || null,
				revenue: {
					total: revenueData.totalRevenue,
					net: revenueData.totalRevenue - revenueData.totalDiscounts,
					discounts: revenueData.totalDiscounts,
				},
				bookings: revenueData.bookingCount,
				tickets: {
					sold: revenueData.totalTickets,
					checkedIn: checkedIn,
					checkInRate: revenueData.totalTickets > 0 ? (checkedIn / revenueData.totalTickets) * 100 : 0,
				},
				views: viewsData.views,
				uniqueViewers: viewsData.uniqueViewers,
			}
		})

		// Sort based on sortBy parameter
		let sortedEvents = [...eventsWithStats]
		switch (sortBy) {
			case "revenue":
				sortedEvents.sort((a, b) => b.revenue.net - a.revenue.net)
				break
			case "bookings":
				sortedEvents.sort((a, b) => b.bookings - a.bookings)
				break
			case "attendance":
				sortedEvents.sort((a, b) => b.tickets.checkedIn - a.tickets.checkedIn)
				break
			case "views":
				sortedEvents.sort((a, b) => b.views - a.views)
				break
			default:
				sortedEvents.sort((a, b) => b.revenue.net - a.revenue.net)
		}

		// Apply pagination
		const total = sortedEvents.length
		const paginatedEvents = sortedEvents.slice(skip, skip + limitNum)

		return sendResponse(
			res,
			{
				events: paginatedEvents,
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
			"Top events retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Analytics Top Events] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch top events", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

