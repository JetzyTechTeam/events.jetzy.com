import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventTraffic } from "@/models/events/event-traffic"
import { Bookings } from "@/models/events/bookings"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"
import { Users } from "@/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
		try {
			const session = await getServerSession(req, res, authOptions)
			if (!session) {
				return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
			}

			const userId = (session.user as any)._id
			const userRole = (session.user as any)?.role
			const isAdmin = userRole === "admin" || userRole === "super admin"
			const { eventId, page, limit } = req.query
			
			// Parse pagination parameters
			const pageNumber = page ? parseInt(page as string, 10) : 1
			const pageSize = limit ? parseInt(limit as string, 10) : 10
			const skip = (pageNumber - 1) * pageSize

			// 1. Validate ownership if eventId is provided, or get all user events
			// Admin can see all events, non-admin can only see their own events
			let matchStage: any = { isDeleted: false }
			
			if (eventId) {
				// If specific eventId is requested, check permissions
				const requestedEvent = await Events.findOne({ 
					_id: new Types.ObjectId(eventId as string), 
					isDeleted: false 
				}).select("_id ownerId host").lean()
				
				if (!requestedEvent) {
					return sendResponse(
						res,
						{
							views: 0,
							uniqueVisitors: 0,
							sales: 0,
							revenue: 0,
							breakdown: [],
							pagination: {
								currentPage: pageNumber,
								itemsPerPage: pageSize,
								totalItems: 0,
								totalPages: 0,
								hasNextPage: false,
								hasPreviousPage: false
							}
						},
						"Event not found",
						true,
						ResCode.OK
					)
				}
				
				// Check if user has access (admin or owner)
				const isOwner = requestedEvent.ownerId?.toString() === userId || 
				              (requestedEvent as any).host?.email === (session.user as any).email
				
				if (!isAdmin && !isOwner) {
					return sendResponse(res, null, "You don't have permission to view this event's marketing data", false, ResCode.FORBIDDEN)
				}
				
				matchStage._id = new Types.ObjectId(eventId as string)
			} else {
				// If no eventId, get events based on role
				if (!isAdmin) {
					// Non-admin: only their own events
					matchStage.ownerId = new Types.ObjectId(userId)
				}
				// Admin: all events (no ownerId filter)
			}

			const userEvents = await Events.find(matchStage).select("_id name slug").lean()
			const eventIds = userEvents.map((e: any) => e._id)

			console.log('[Seller Stats API] Access check:', {
				userId,
				isAdmin,
				eventId: eventId || 'all',
				eventIdsCount: eventIds.length,
				eventIds: eventIds.map((id: any) => id.toString())
			})

			if (eventIds.length === 0) {
				return sendResponse(res, {
					views: 0,
					uniqueVisitors: 0,
					sales: 0,
					revenue: 0,
					breakdown: [],
					pagination: {
						currentPage: pageNumber,
						itemsPerPage: pageSize,
						totalItems: 0,
						totalPages: 0,
						hasNextPage: false,
						hasPreviousPage: false
					}
				}, "No events found", true, ResCode.OK)
			}

		// 2. Aggregate Traffic (Views)
		// First, get total count to verify records exist
		const totalTrafficCount = await EventTraffic.countDocuments({ eventId: { $in: eventIds } })
		
		const trafficStats = await EventTraffic.aggregate([
			{ $match: { eventId: { $in: eventIds } } },
			{
				$group: {
					_id: { $ifNull: ["$referralCode", "direct"] }, // Use "direct" for null referral codes
					totalViews: { $sum: 1 },
					uniqueVisitors: { $addToSet: "$visitorId" }, // Estimate unique guests
					uniqueUserIds: { $addToSet: "$userId" },     // Get unique logged-in user IDs
					allUserIds: {
						$push: {
							$cond: [{ $ifNull: ["$userId", false] }, "$userId", "$$REMOVE"]
						}
					}
				}
			}
		])
		
		// Get all unique user IDs across all referral codes
		const allUniqueUserIds = new Set<Types.ObjectId>()
		trafficStats.forEach((stat: any) => {
			if (stat.uniqueUserIds) {
				stat.uniqueUserIds.forEach((uid: any) => {
					if (uid && uid !== null && uid !== undefined) {
						allUniqueUserIds.add(new Types.ObjectId(uid))
					}
				})
			}
		})
		
		// Fetch user details for all logged-in users
		const userIdsArray = Array.from(allUniqueUserIds)
		const users = userIdsArray.length > 0 ? await Users.find({ _id: { $in: userIdsArray } }).select('firstName lastName email').lean() : []
		const eventUsers = userIdsArray.length > 0 ? await EventUsers.find({ _id: { $in: userIdsArray } }).select('firstName lastName email').lean() : []
		
		// Create a map of userId to user details
		const userMap = new Map<string, { name: string; email: string }>()
		users.forEach((u: any) => {
			userMap.set(u._id.toString(), {
				name: `${u.firstName} ${u.lastName}`,
				email: u.email
			})
		})
		eventUsers.forEach((u: any) => {
			userMap.set(u._id.toString(), {
				name: `${u.firstName} ${u.lastName}`,
				email: u.email
			})
		})
		
		console.log('[Seller Stats API] Traffic aggregation:', {
			userId,
			eventIds: eventIds.map((id: any) => id.toString()),
			eventIdsCount: eventIds.length,
			totalTrafficRecords: totalTrafficCount,
			trafficStatsCount: trafficStats.length,
			trafficStats: trafficStats.map((t: any) => ({
				referralCode: t._id,
				views: t.totalViews,
				uniqueVisitors: t.uniqueVisitors?.length || 0
			}))
		})

		// 3. Aggregate Bookings (Sales)
		const bookingStats = await Bookings.aggregate([
			{
				$match: {
					eventId: { $in: eventIds },
					status: "confirmed",
					isDeleted: false
				}
			},
			{
				$group: {
					_id: "$referralCode",
					totalSales: { $sum: 1 },
					totalRevenue: { $sum: "$total" },
					ticketCount: { 
						$sum: {
							$reduce: {
								input: { $ifNull: ["$tickets", []] },
								initialValue: 0,
								in: { $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }] }
							}
						}
					},
					buyers: { $addToSet: "$customerEmail" }
				}
			}
		])

		console.log('[Seller Stats API] Booking stats:', JSON.stringify(bookingStats.map((b: any) => ({
			referralCode: b._id,
			sales: b.totalSales,
			revenue: b.totalRevenue,
			buyers: b.buyers
		})), null, 2))

		// Get all unique buyer emails from bookings
		const allBuyerEmails = new Set<string>()
		bookingStats.forEach((stat: any) => {
			if (stat.buyers && Array.isArray(stat.buyers)) {
				stat.buyers.forEach((email: string) => {
					if (email && email.trim()) {
						allBuyerEmails.add(email.toLowerCase().trim())
					}
				})
			}
		})

		// Find user IDs for buyer emails (logged-in users who purchased)
		const buyerEmailsArray = Array.from(allBuyerEmails)
		const buyerUsers = buyerEmailsArray.length > 0 
			? await Users.find({ email: { $in: buyerEmailsArray } }).select('_id firstName lastName email').lean() 
			: []
		const buyerEventUsers = buyerEmailsArray.length > 0 
			? await EventUsers.find({ email: { $in: buyerEmailsArray } }).select('_id firstName lastName email').lean() 
			: []

		// Create a map of email to user details for buyers
		const buyerEmailMap = new Map<string, { name: string; email: string }>()
		buyerUsers.forEach((u: any) => {
			buyerEmailMap.set(u.email.toLowerCase(), {
				name: `${u.firstName} ${u.lastName}`,
				email: u.email
			})
		})
		buyerEventUsers.forEach((u: any) => {
			buyerEmailMap.set(u.email.toLowerCase(), {
				name: `${u.firstName} ${u.lastName}`,
				email: u.email
			})
		})

		// 4. Merge Data
		const breakdown = trafficStats.map((traffic: any) => {
			// Handle both null and "direct" as "Direct / No Code"
			const code = (traffic._id === null || traffic._id === "direct" || !traffic._id) ? "Direct / No Code" : traffic._id
			const salesData = bookingStats.find((b: any) => {
				const saleCode = (b._id === null || !b._id) ? "direct" : String(b._id).toLowerCase()
				const trafficCode = (traffic._id === null || traffic._id === "direct" || !traffic._id) ? "direct" : String(traffic._id).toLowerCase()
				const matches = saleCode === trafficCode
				if (matches) {
					console.log('[Seller Stats API] Matched referral code:', {
						trafficCode,
						saleCode,
						revenue: b.totalRevenue,
						sales: b.totalSales
					})
				}
				return matches
			}) || { totalSales: 0, totalRevenue: 0, ticketCount: 0, buyers: [] }

			// Get logged-in user details from viewers (EventTraffic)
			const loggedInUsersSet = new Set<string>() // Use Set to track unique emails
			const loggedInUsers: Array<{ name: string; email: string }> = []
			
			if (traffic.uniqueUserIds) {
				traffic.uniqueUserIds.forEach((uid: any) => {
					if (uid && uid !== null && uid !== undefined) {
						const userIdStr = uid.toString ? uid.toString() : String(uid)
						const userDetails = userMap.get(userIdStr)
						if (userDetails && !loggedInUsersSet.has(userDetails.email.toLowerCase())) {
							loggedInUsersSet.add(userDetails.email.toLowerCase())
							loggedInUsers.push(userDetails)
						}
					}
				})
			}

			// Add logged-in users who purchased tickets (from Bookings)
			if (salesData.buyers && Array.isArray(salesData.buyers)) {
				salesData.buyers.forEach((buyerEmail: string) => {
					if (buyerEmail && buyerEmail.trim()) {
						const buyerDetails = buyerEmailMap.get(buyerEmail.toLowerCase().trim())
						if (buyerDetails && !loggedInUsersSet.has(buyerDetails.email.toLowerCase())) {
							loggedInUsersSet.add(buyerDetails.email.toLowerCase())
							loggedInUsers.push(buyerDetails)
						}
					}
				})
			}

			return {
				referralCode: code,
				views: traffic.totalViews,
				uniqueVisitors: traffic.uniqueVisitors ? traffic.uniqueVisitors.filter((v: any) => v !== null && v !== undefined).length : 0,
				identifiedUsers: loggedInUsers.length,
				loggedInUserDetails: loggedInUsers, // Array of user names and emails (viewers + buyers)
				sales: salesData.totalSales,
				ticketsSold: salesData.ticketCount,
				revenue: salesData.totalRevenue,
			}
		})
		
		// Add codes that had sales but no tracked views (edge case)
		bookingStats.forEach((sale: any) => {
			const saleCode = (sale._id === null || !sale._id) ? "direct" : String(sale._id).toLowerCase()
			const existsInTraffic = trafficStats.find((t: any) => {
				const trafficCode = (t._id === null || t._id === "direct" || !t._id) ? "direct" : String(t._id).toLowerCase()
				return trafficCode === saleCode
			})
			
			if (!existsInTraffic) {
				// Get logged-in users who purchased for this referral code
				const loggedInBuyers: Array<{ name: string; email: string }> = []
				if (sale.buyers && Array.isArray(sale.buyers)) {
					sale.buyers.forEach((buyerEmail: string) => {
						if (buyerEmail && buyerEmail.trim()) {
							const buyerDetails = buyerEmailMap.get(buyerEmail.toLowerCase().trim())
							if (buyerDetails) {
								loggedInBuyers.push(buyerDetails)
							}
						}
					})
				}

				breakdown.push({
					referralCode: sale._id || "Direct / No Code",
					views: 0,
					uniqueVisitors: 0,
					identifiedUsers: loggedInBuyers.length,
					loggedInUserDetails: loggedInBuyers, // Include buyers even if no views tracked
					sales: sale.totalSales,
					ticketsSold: sale.ticketCount,
					revenue: sale.totalRevenue,
				})
			}
		})

		// Sort breakdown by views (descending)
		const sortedBreakdown = breakdown.sort((a, b) => b.views - a.views)
		
		// Calculate totals before pagination
		const totalViews = sortedBreakdown.reduce((acc, curr) => acc + curr.views, 0)
		const totalSales = sortedBreakdown.reduce((acc, curr) => acc + curr.sales, 0)
		const totalRevenue = sortedBreakdown.reduce((acc, curr) => acc + curr.revenue, 0)
		
		// Apply pagination
		const totalItems = sortedBreakdown.length
		const totalPages = Math.ceil(totalItems / pageSize)
		const paginatedBreakdown = sortedBreakdown.slice(skip, skip + pageSize)

		const summary = {
			totalViews,
			totalSales,
			totalRevenue,
			breakdown: paginatedBreakdown,
			pagination: {
				currentPage: pageNumber,
				itemsPerPage: pageSize,
				totalItems,
				totalPages,
				hasNextPage: pageNumber < totalPages,
				hasPreviousPage: pageNumber > 1
			}
		}

		console.log('[Seller Stats API] Final summary:', {
			totalViews: summary.totalViews,
			totalSales: summary.totalSales,
			totalRevenue: summary.totalRevenue,
			breakdownCount: paginatedBreakdown.length,
			totalItems,
			pagination: summary.pagination
		})

		return sendResponse(res, summary, "Stats retrieved successfully", true, ResCode.OK)

	} catch (error: any) {
		console.error("Stats Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch stats", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
