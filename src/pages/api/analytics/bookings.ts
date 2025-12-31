import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Bookings as BookingsModel } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
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

		const matchStage: any = { isDeleted: false }
		if (Object.keys(dateFilter).length > 0) {
			matchStage.createdAt = dateFilter
		}

		// Group by date format
		let dateFormat: any
		switch (groupBy) {
			case "week":
				dateFormat = { $dateToString: { format: "%Y-W%U", date: "$createdAt" } }
				break
			case "month":
				dateFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } }
				break
			case "day":
			default:
				dateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
				break
		}

		// Aggregate bookings by date and status
		const bookingsByDate = await BookingsModel.aggregate([
			{ $match: matchStage },
			{
				$group: {
					_id: {
						date: dateFormat,
						status: "$status",
					},
					count: { $sum: 1 },
					totalRevenue: {
						$sum: {
							$cond: [{ $eq: ["$status", BookingStatus.CONFIRMED] }, "$total", 0],
						},
					},
					totalTickets: {
						$sum: {
							$cond: [
								{ $eq: ["$status", BookingStatus.CONFIRMED] },
								{
									$reduce: {
										input: "$tickets",
										initialValue: 0,
										in: { $add: ["$$value", "$$this.quantity"] },
									},
								},
								0,
							],
						},
					},
				},
			},
			{
				$group: {
					_id: "$_id.date",
					bookings: {
						$push: {
							status: "$_id.status",
							count: "$count",
						},
					},
					totalBookings: { $sum: "$count" },
					totalRevenue: { $sum: "$totalRevenue" },
					totalTickets: { $sum: "$totalTickets" },
				},
			},
			{ $sort: { _id: 1 } },
			{
				$project: {
					date: "$_id",
					bookings: 1,
					totalBookings: 1,
					totalRevenue: 1,
					totalTickets: 1,
					byStatus: {
						$arrayToObject: {
							$map: {
								input: "$bookings",
								as: "booking",
								in: {
									k: "$$booking.status",
									v: "$$booking.count",
								},
							},
						},
					},
				},
			},
		])

		// Get totals
		const totalBookings = await BookingsModel.countDocuments(matchStage)
		const confirmedBookings = await BookingsModel.countDocuments({
			...matchStage,
			status: BookingStatus.CONFIRMED,
		})

		const revenueStats = await BookingsModel.aggregate([
			{ $match: { ...matchStage, status: BookingStatus.CONFIRMED } },
			{
				$group: {
					_id: null,
					totalRevenue: { $sum: "$total" },
					totalTickets: {
						$sum: {
							$reduce: {
								input: "$tickets",
								initialValue: 0,
								in: { $add: ["$$value", "$$this.quantity"] },
							},
						},
					},
					totalDiscounts: { $sum: "$discountAmount" },
					averageBookingValue: { $avg: "$total" },
				},
			},
		])

		const revenueData = revenueStats[0] || {
			totalRevenue: 0,
			totalTickets: 0,
			totalDiscounts: 0,
			averageBookingValue: 0,
		}

		// Get bookings by status
		const bookingsByStatus = await BookingsModel.aggregate([
			{ $match: matchStage },
			{
				$group: {
					_id: "$status",
					count: { $sum: 1 },
				},
			},
		])

		const statusBreakdown: any = {}
		bookingsByStatus.forEach((item) => {
			statusBreakdown[item._id] = item.count
		})

		const response = {
			totals: {
				totalBookings,
				confirmedBookings,
				totalRevenue: revenueData.totalRevenue,
				totalTickets: revenueData.totalTickets,
				totalDiscounts: revenueData.totalDiscounts,
				averageBookingValue: Math.round(revenueData.averageBookingValue * 100) / 100,
			},
			byStatus: statusBreakdown,
			byDate: bookingsByDate,
			dateRange: {
				from: dateFrom?.toISOString() || null,
				to: dateTo?.toISOString() || null,
			},
			groupBy,
		}

		return sendResponse(res, response, "Booking analytics retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Bookings] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch booking analytics", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

