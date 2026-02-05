import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { BookingStatus } from "@/models/events/types"
import { Bookings as BookingsModel } from "@/models/events/bookings"
import { CheckIn } from "@/models/checkIn"
import { Users } from "@/models/userModal"
import { ReferralCodes } from "@/models/events/referral-codes"
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

		// Parse date range from query params
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

		// Build date filter
		const dateFilter: any = {}
		if (dateFrom) dateFilter.$gte = dateFrom
		if (dateTo) dateFilter.$lte = dateTo

		const now = new Date()

		// 1. EVENT METRICS
		const totalEvents = await Events.countDocuments({ isDeleted: false })
		const publicEvents = await Events.countDocuments({ isDeleted: false, privacy: "public" })
		const privateEvents = await Events.countDocuments({ isDeleted: false, privacy: "private" })
		const paidEvents = await Events.countDocuments({ isDeleted: false, isPaid: true })
		const freeEvents = await Events.countDocuments({ isDeleted: false, isPaid: false })
		const upcomingEvents = await Events.countDocuments({ isDeleted: false, startsOn: { $gt: now } })
		const pastEvents = await Events.countDocuments({ isDeleted: false, endsOn: { $lt: now } })

		// 2. BOOKING METRICS
		const bookingMatch: any = { isDeleted: false }
		if (dateFrom || dateTo) {
			bookingMatch.createdAt = dateFilter
		}

		const totalBookings = await BookingsModel.countDocuments(bookingMatch)
		const confirmedBookings = await BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.CONFIRMED })
		const pendingBookings = await BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.PENDING })
		const cancelledBookings = await BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.CANCELLED })
		const failedBookings = await BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.FAILED })
		const refundedBookings = await BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.REFUNDED })

		// Get booking totals (revenue and tickets)
		const bookingStats = await BookingsModel.aggregate([
			{ $match: { ...bookingMatch, status: BookingStatus.CONFIRMED } },
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
					uniqueEvents: { $addToSet: "$eventId" },
				},
			},
		])

		const revenueData = bookingStats[0] || { totalRevenue: 0, totalTickets: 0, totalDiscounts: 0, uniqueEvents: [] }
		const eventsWithBookings = revenueData.uniqueEvents?.length || 0

		// 3. CHECK-IN METRICS
		const checkInMatch: any = {}
		if (dateFrom || dateTo) {
			checkInMatch.createdAt = dateFilter
		}

		const checkInStats = await CheckIn.aggregate([
			{ $match: checkInMatch },
			{
				$group: {
					_id: null,
					totalCheckedIn: { $sum: "$checkedInCount" },
					totalTicketsPurchased: { $sum: "$totalTickets" },
				},
			},
		])

		const checkInData = checkInStats[0] || { totalCheckedIn: 0, totalTicketsPurchased: 0 }
		const checkInRate =
			checkInData.totalTicketsPurchased > 0
				? (checkInData.totalCheckedIn / checkInData.totalTicketsPurchased) * 100
				: 0

		// 4. USER METRICS
		// NOTE: Users are entities, not time-series data, so we show ALL users regardless of creation date
		// Only active users are filtered by lastActiveAt based on date range
		const totalUsers = await Users.countDocuments({})
		const adminUsers = await Users.countDocuments({ role: "admin" })
		const regularUsers = await Users.countDocuments({ role: "user" })

		// Calculate active vs inactive users using lastActiveAt field (fast, indexed query)
		// Active users = users with lastActiveAt within the last 30 days (or within date range if specified)
		const activeUserPeriod = dateTo || new Date()
		const activeUserPeriodStart = new Date(activeUserPeriod)
		if (dateFrom) {
			activeUserPeriodStart.setTime(dateFrom.getTime())
		} else {
			// Default to last 30 days if no date range specified
			activeUserPeriodStart.setDate(activeUserPeriodStart.getDate() - 30)
		}
		activeUserPeriodStart.setHours(0, 0, 0, 0)

		// Count active users using lastActiveAt field (fast indexed query, no aggregation needed)
		// Active users = users who were active within the date range (or last 30 days if no range specified)
		const activeUsers = await Users.countDocuments({
			lastActiveAt: { $gte: activeUserPeriodStart, $lte: activeUserPeriod },
		})

		// Count active admins and active regular users separately (fast indexed queries)
		const activeAdmins = await Users.countDocuments({
			role: "admin",
			lastActiveAt: { $gte: activeUserPeriodStart, $lte: activeUserPeriod },
		})

		const activeRegular = await Users.countDocuments({
			role: "user",
			lastActiveAt: { $gte: activeUserPeriodStart, $lte: activeUserPeriod },
		})

		// Inactive users = total users - active users
		const inactiveUsers = Math.max(0, totalUsers - activeUsers)
		const activeUserRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0
		const inactiveUserRate = totalUsers > 0 ? (inactiveUsers / totalUsers) * 100 : 0

		// Calculate inactive users by role
		const inactiveAdmins = Math.max(0, adminUsers - activeAdmins)
		const inactiveRegular = Math.max(0, regularUsers - activeRegular)

		// 5. REFERRAL CODE METRICS
		// NOTE: Referral codes are entities, not time-series data, so we show ALL codes regardless of creation date
		// Usage count shows total usage across all time (usageCount is cumulative)
		const referralMatch: any = { isDeleted: false }
		
		const totalReferralCodes = await ReferralCodes.countDocuments(referralMatch)
		const activeReferralCodes = await ReferralCodes.countDocuments({ ...referralMatch, isActive: true })
		const inactiveReferralCodes = await ReferralCodes.countDocuments({ ...referralMatch, isActive: false })

		// Get total usage count (cumulative across all time)
		const referralStats = await ReferralCodes.aggregate([
			{ $match: referralMatch },
			{
				$group: {
					_id: null,
					totalUsage: { $sum: "$usageCount" },
				},
			},
		])

		const referralUsage = referralStats[0]?.totalUsage || 0

		// 6. VISITOR & SESSION METRICS (from analytics models)
		const sessionMatch: any = {}
		if (dateFrom || dateTo) {
			sessionMatch.startTime = dateFilter
		}

		const totalSessions = await UserSession.countDocuments(sessionMatch)
		const loggedInSessions = await UserSession.countDocuments({ ...sessionMatch, isLoggedIn: true })
		const anonymousSessions = await UserSession.countDocuments({ ...sessionMatch, isLoggedIn: false })

		// Get unique visitors (distinct sessionIds or userIds)
		const uniqueVisitors = await UserSession.distinct("sessionId", sessionMatch).then((ids) => ids.length)
		const uniqueLoggedInUsers = await UserSession.distinct("userId", {
			...sessionMatch,
			userId: { $ne: null },
		}).then((ids) => ids.length)

		// Average session duration
		const avgSessionDuration = await UserSession.aggregate([
			{ $match: { ...sessionMatch, duration: { $exists: true, $ne: null } } },
			{
				$group: {
					_id: null,
					avgDuration: { $avg: "$duration" },
				},
			},
		])

		const avgDuration = avgSessionDuration[0]?.avgDuration || 0

		// 7. PAGE VIEW METRICS
		const pageViewMatch: any = {}
		if (dateFrom || dateTo) {
			pageViewMatch.timestamp = dateFilter
		}

		const totalPageViews = await PageView.countDocuments(pageViewMatch)

		// Calculate bounce rate (sessions with only 1 page view)
		const bouncedSessions = await UserSession.countDocuments({
			...sessionMatch,
			pageCount: { $lte: 1 },
		})
		const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0

		// 8. CALCULATE AVERAGES
		// Average revenue per event = total revenue / events with bookings in date range (or all events if no date filter)
		const avgRevenuePerEvent =
			eventsWithBookings > 0 ? revenueData.totalRevenue / eventsWithBookings : 0
		const avgTicketsPerBooking =
			confirmedBookings > 0 ? revenueData.totalTickets / confirmedBookings : 0
		const avgBookingValue =
			confirmedBookings > 0 ? revenueData.totalRevenue / confirmedBookings : 0

		// Build response
		const overview = {
			bounceRate: Math.round(bounceRate * 100) / 100,
			events: {
				total: totalEvents,
				public: publicEvents,
				private: privateEvents,
				paid: paidEvents,
				free: freeEvents,
				upcoming: upcomingEvents,
				past: pastEvents,
			},
			bookings: {
				total: totalBookings,
				confirmed: confirmedBookings,
				pending: pendingBookings,
				cancelled: cancelledBookings,
				failed: failedBookings,
				refunded: refundedBookings,
				byStatus: {
					confirmed: confirmedBookings,
					pending: pendingBookings,
					cancelled: cancelledBookings,
					failed: failedBookings,
					refunded: refundedBookings,
				},
			},
			revenue: {
				total: revenueData.totalRevenue,
				netRevenue: revenueData.totalRevenue - revenueData.totalDiscounts,
				totalDiscounts: revenueData.totalDiscounts,
				averagePerEvent: avgRevenuePerEvent,
				averagePerBooking: avgBookingValue,
			},
			tickets: {
				totalSold: revenueData.totalTickets,
				averagePerBooking: avgTicketsPerBooking,
			},
			checkIns: {
				totalCheckedIn: checkInData.totalCheckedIn,
				totalTicketsPurchased: checkInData.totalTicketsPurchased,
				checkInRate: Math.round(checkInRate * 100) / 100, // Round to 2 decimal places
			},
			users: {
				total: totalUsers,
				admins: adminUsers,
				regular: regularUsers,
				active: activeUsers,
				inactive: inactiveUsers,
				activeRate: Math.round(activeUserRate * 100) / 100,
				inactiveRate: Math.round(inactiveUserRate * 100) / 100,
				activeAdmins: activeAdmins,
				activeRegular: activeRegular,
				inactiveAdmins: inactiveAdmins,
				inactiveRegular: inactiveRegular,
			},
			referralCodes: {
				total: totalReferralCodes,
				active: activeReferralCodes,
				inactive: inactiveReferralCodes,
				totalUsage: referralUsage,
			},
			visitors: {
				totalSessions: totalSessions,
				loggedInSessions: loggedInSessions,
				anonymousSessions: anonymousSessions,
				uniqueVisitors: uniqueVisitors,
				uniqueLoggedInUsers: uniqueLoggedInUsers,
			},
			sessions: {
				total: totalSessions,
				averageDuration: Math.round(avgDuration), // in seconds
			},
			pageViews: {
				total: totalPageViews,
			},
			dateRange: {
				from: dateFrom?.toISOString() || null,
				to: dateTo?.toISOString() || null,
			},
		}

		return sendResponse(res, overview, "Analytics overview retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Overview] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch analytics overview", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

