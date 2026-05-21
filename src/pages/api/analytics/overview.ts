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

		// Parse date range from query params
		let dateFrom: Date | null = null
		let dateTo: Date | null = null

		if (req.query.dateFrom) {
			dateFrom = new Date(req.query.dateFrom as string)
			dateFrom.setHours(0, 0, 0, 0)
		}

		if (req.query.dateTo) {
			dateTo = new Date(req.query.dateTo as string)
			dateTo.setHours(23, 59, 59, 999)
		}

		const dateFilter: any = {}
		if (dateFrom) dateFilter.$gte = dateFrom
		if (dateTo) dateFilter.$lte = dateTo

		const now = new Date()

		// Build query matchers up front
		const bookingMatch: any = { isDeleted: false }
		if (dateFrom || dateTo) bookingMatch.createdAt = dateFilter

		const checkInMatch: any = {}
		if (dateFrom || dateTo) checkInMatch.createdAt = dateFilter

		const sessionMatch: any = {}
		if (dateFrom || dateTo) sessionMatch.startTime = dateFilter

		const pageViewMatch: any = {}
		if (dateFrom || dateTo) pageViewMatch.timestamp = dateFilter

		const referralMatch: any = { isDeleted: false }

		const activeUserPeriod = dateTo || new Date()
		const activeUserPeriodStart = new Date(activeUserPeriod)
		if (dateFrom) {
			activeUserPeriodStart.setTime(dateFrom.getTime())
		} else {
			activeUserPeriodStart.setDate(activeUserPeriodStart.getDate() - 30)
		}
		activeUserPeriodStart.setHours(0, 0, 0, 0)
		const activeUserFilter = { lastActiveAt: { $gte: activeUserPeriodStart, $lte: activeUserPeriod } }

		// Run all independent queries in parallel
		const [
			// Events (7)
			totalEvents,
			publicEvents,
			privateEvents,
			paidEvents,
			freeEvents,
			upcomingEvents,
			pastEvents,
			// Bookings (6 + 1 aggregation)
			totalBookings,
			confirmedBookings,
			pendingBookings,
			cancelledBookings,
			failedBookings,
			refundedBookings,
			bookingStats,
			// Check-in (1 aggregation)
			checkInStats,
			// Users (6)
			totalUsers,
			adminUsers,
			regularUsers,
			activeUsers,
			activeAdmins,
			activeRegular,
			// Referrals (3 + 1 aggregation)
			totalReferralCodes,
			activeReferralCodes,
			inactiveReferralCodes,
			referralStats,
			// Sessions (3 + 1 distinct + 1 distinct + 1 aggregation)
			totalSessions,
			loggedInSessions,
			anonymousSessions,
			uniqueVisitors,
			uniqueLoggedInUsers,
			avgSessionDuration,
			// Page views (1 + 1 bounce)
			totalPageViews,
			bouncedSessions,
		] = await Promise.all([
			// Events
			Events.countDocuments({ isDeleted: false }),
			Events.countDocuments({ isDeleted: false, privacy: "public" }),
			Events.countDocuments({ isDeleted: false, privacy: "private" }),
			Events.countDocuments({ isDeleted: false, isPaid: true }),
			Events.countDocuments({ isDeleted: false, isPaid: false }),
			Events.countDocuments({ isDeleted: false, startsOn: { $gt: now } }),
			Events.countDocuments({ isDeleted: false, endsOn: { $lt: now } }),
			// Bookings
			BookingsModel.countDocuments(bookingMatch),
			BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.CONFIRMED }),
			BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.PENDING }),
			BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.CANCELLED }),
			BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.FAILED }),
			BookingsModel.countDocuments({ ...bookingMatch, status: BookingStatus.REFUNDED }),
			BookingsModel.aggregate([
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
			]),
			// Check-in
			CheckIn.aggregate([
				{ $match: checkInMatch },
				{
					$group: {
						_id: null,
						totalCheckedIn: { $sum: "$checkedInCount" },
						totalTicketsPurchased: { $sum: "$totalTickets" },
					},
				},
			]),
			// Users
			Users.countDocuments({}),
			Users.countDocuments({ role: "admin" }),
			Users.countDocuments({ role: "user" }),
			Users.countDocuments(activeUserFilter),
			Users.countDocuments({ role: "admin", ...activeUserFilter }),
			Users.countDocuments({ role: "user", ...activeUserFilter }),
			// Referrals
			ReferralCodes.countDocuments(referralMatch),
			ReferralCodes.countDocuments({ ...referralMatch, isActive: true }),
			ReferralCodes.countDocuments({ ...referralMatch, isActive: false }),
			ReferralCodes.aggregate([
				{ $match: referralMatch },
				{ $group: { _id: null, totalUsage: { $sum: "$usageCount" } } },
			]),
			// Sessions — use countDocuments instead of distinct (sessionId is unique, same result)
			UserSession.countDocuments(sessionMatch),
			UserSession.countDocuments({ ...sessionMatch, isLoggedIn: true }),
			UserSession.countDocuments({ ...sessionMatch, isLoggedIn: false }),
			// uniqueVisitors: sessionId is unique per row, so count == distinct count
			UserSession.countDocuments(sessionMatch),
			// uniqueLoggedInUsers: count distinct users via aggregation (avoids loading all IDs into memory)
			UserSession.aggregate([
				{ $match: { ...sessionMatch, userId: { $ne: null } } },
				{ $group: { _id: "$userId" } },
				{ $count: "count" },
			]).then((r: any[]) => r[0]?.count || 0),
			UserSession.aggregate([
				{ $match: { ...sessionMatch, duration: { $exists: true, $ne: null } } },
				{ $group: { _id: null, avgDuration: { $avg: "$duration" } } },
			]),
			// Page views
			PageView.countDocuments(pageViewMatch),
			UserSession.countDocuments({ ...sessionMatch, pageCount: { $lte: 1 } }),
		])

		// Derived values
		const revenueData = (bookingStats as any[])[0] || { totalRevenue: 0, totalTickets: 0, totalDiscounts: 0, uniqueEvents: [] }
		const eventsWithBookings = revenueData.uniqueEvents?.length || 0
		const checkInData = (checkInStats as any[])[0] || { totalCheckedIn: 0, totalTicketsPurchased: 0 }
		const checkInRate = checkInData.totalTicketsPurchased > 0 ? (checkInData.totalCheckedIn / checkInData.totalTicketsPurchased) * 100 : 0
		const referralUsage = (referralStats as any[])[0]?.totalUsage || 0
		const avgDuration = (avgSessionDuration as any[])[0]?.avgDuration || 0
		const bounceRate = (totalSessions as number) > 0 ? ((bouncedSessions as number) / (totalSessions as number)) * 100 : 0

		const inactiveUsers = Math.max(0, (totalUsers as number) - (activeUsers as number))
		const activeUserRate = (totalUsers as number) > 0 ? ((activeUsers as number) / (totalUsers as number)) * 100 : 0
		const inactiveUserRate = (totalUsers as number) > 0 ? (inactiveUsers / (totalUsers as number)) * 100 : 0
		const inactiveAdmins = Math.max(0, (adminUsers as number) - (activeAdmins as number))
		const inactiveRegular = Math.max(0, (regularUsers as number) - (activeRegular as number))
		const avgRevenuePerEvent = eventsWithBookings > 0 ? revenueData.totalRevenue / eventsWithBookings : 0
		const avgTicketsPerBooking = (confirmedBookings as number) > 0 ? revenueData.totalTickets / (confirmedBookings as number) : 0
		const avgBookingValue = (confirmedBookings as number) > 0 ? revenueData.totalRevenue / (confirmedBookings as number) : 0

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
				checkInRate: Math.round(checkInRate * 100) / 100,
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
				averageDuration: Math.round(avgDuration),
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
