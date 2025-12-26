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
		const { eventId } = req.query

		// 1. Validate ownership if eventId is provided, or get all user events
		let matchStage: any = { ownerId: new Types.ObjectId(userId), isDeleted: false }
		if (eventId) {
			matchStage._id = new Types.ObjectId(eventId as string)
		}

		const userEvents = await Events.find(matchStage).select("_id name slug").lean()
		const eventIds = userEvents.map((e: any) => e._id)

		if (eventIds.length === 0) {
			return sendResponse(res, {
				views: 0,
				uniqueVisitors: 0,
				sales: 0,
				revenue: 0,
				breakdown: []
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
					ticketCount: { $sum: { $sum: "$tickets.quantity" } },
					buyers: { $addToSet: "$customerEmail" }
				}
			}
		])

		// 4. Merge Data
		const breakdown = trafficStats.map((traffic: any) => {
			// Handle both null and "direct" as "Direct / No Code"
			const code = (traffic._id === null || traffic._id === "direct" || !traffic._id) ? "Direct / No Code" : traffic._id
			const salesData = bookingStats.find((b: any) => {
				const saleCode = (b._id === null || !b._id) ? "direct" : b._id
				return saleCode === traffic._id
			}) || { totalSales: 0, totalRevenue: 0, ticketCount: 0 }

			// Get logged-in user details
			const loggedInUsers: Array<{ name: string; email: string }> = []
			if (traffic.uniqueUserIds) {
				traffic.uniqueUserIds.forEach((uid: any) => {
					if (uid && uid !== null && uid !== undefined) {
						const userIdStr = uid.toString ? uid.toString() : String(uid)
						const userDetails = userMap.get(userIdStr)
						if (userDetails) {
							loggedInUsers.push(userDetails)
						}
					}
				})
			}

			return {
				referralCode: code,
				views: traffic.totalViews,
				uniqueVisitors: traffic.uniqueVisitors ? traffic.uniqueVisitors.filter((v: any) => v !== null && v !== undefined).length : 0,
				identifiedUsers: loggedInUsers.length,
				loggedInUserDetails: loggedInUsers, // Array of user names and emails
				sales: salesData.totalSales,
				ticketsSold: salesData.ticketCount,
				revenue: salesData.totalRevenue,
			}
		})
		
		// Add codes that had sales but no tracked views (edge case)
		bookingStats.forEach((sale: any) => {
			if (!trafficStats.find((t: any) => t._id === sale._id)) {
				breakdown.push({
					referralCode: sale._id || "Direct / No Code",
					views: 0,
					uniqueVisitors: 0,
					identifiedUsers: 0,
					sales: sale.totalSales,
					ticketsSold: sale.ticketCount,
					revenue: sale.totalRevenue,
				})
			}
		})

		const summary = {
			totalViews: breakdown.reduce((acc, curr) => acc + curr.views, 0),
			totalSales: breakdown.reduce((acc, curr) => acc + curr.sales, 0),
			totalRevenue: breakdown.reduce((acc, curr) => acc + curr.revenue, 0),
			breakdown: breakdown.sort((a, b) => b.views - a.views)
		}

		console.log('[Seller Stats API] Final summary:', {
			totalViews: summary.totalViews,
			totalSales: summary.totalSales,
			totalRevenue: summary.totalRevenue,
			breakdownCount: summary.breakdown.length
		})

		return sendResponse(res, summary, "Stats retrieved successfully", true, ResCode.OK)

	} catch (error: any) {
		console.error("Stats Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch stats", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
