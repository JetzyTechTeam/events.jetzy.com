import { sendResponse, stripHTMLAndDecode } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventTraffic } from "@/models/events/event-traffic"
import { Bookings } from "@/models/events/bookings"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
import { Types } from "mongoose"
import { Users } from "@/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import * as XLSX from "xlsx"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		}

		const userId = (session.user as any)._id
		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const { eventId } = req.query

		// Validate ownership if eventId is provided
		let matchStage: any = { isDeleted: false }

		if (eventId) {
			const requestedEvent = await Events.findOne({
				_id: new Types.ObjectId(eventId as string),
				isDeleted: false
			}).select("_id ownerId host name").lean()

			if (!requestedEvent) {
				return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
			}

			const isOwner = requestedEvent.ownerId?.toString() === userId ||
				(requestedEvent as any).host?.email === (session.user as any).email

			if (!isAdmin && !isOwner) {
				return sendResponse(res, null, "You don't have permission to export this event's marketing data", false, ResCode.FORBIDDEN)
			}

			matchStage._id = new Types.ObjectId(eventId as string)
		} else {
			if (!isAdmin) {
				matchStage.ownerId = new Types.ObjectId(userId)
			}
		}

		const userEvents = await Events.find(matchStage).select("_id name slug").lean()
		const eventIds = userEvents.map((e: any) => e._id)

		if (eventIds.length === 0) {
			return sendResponse(res, null, "No events found", false, ResCode.NOT_FOUND)
		}

		// Get event name for filename - strip HTML and clean it
		let eventName = "Event"
		if (eventId && userEvents.length > 0) {
			const rawName = (userEvents[0] as any).name
			if (rawName) {
				// Strip HTML tags and decode entities
				const cleanedName = stripHTMLAndDecode(rawName)
				// Replace any non-alphanumeric characters with underscore and limit length
				eventName = cleanedName.replace(/[^a-z0-9]/gi, '_').substring(0, 50) || "Event"
			}
		} else {
			eventName = "AllEvents"
		}

		// Aggregate Traffic (Views) - Get ALL data without pagination
		const trafficStats = await EventTraffic.aggregate([
			{ $match: { eventId: { $in: eventIds } } },
			{
				$group: {
					_id: { $ifNull: ["$referralCode", "direct"] },
					totalViews: { $sum: 1 },
					uniqueVisitors: { $addToSet: "$visitorId" },
					uniqueUserIds: { $addToSet: "$userId" },
					allUserIds: {
						$push: {
							$cond: [{ $ifNull: ["$userId", false] }, "$userId", "$$REMOVE"]
						}
					}
				}
			}
		])

		// Get all unique user IDs
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

		// Fetch user details
		const userIdsArray = Array.from(allUniqueUserIds)
		const users = userIdsArray.length > 0 ? await Users.find({ _id: { $in: userIdsArray } }).select('firstName lastName email').lean() : []
		const eventUsers = userIdsArray.length > 0 ? await EventUsers.find({ _id: { $in: userIdsArray } }).select('firstName lastName email').lean() : []

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

		// Aggregate Bookings (Sales) - Get ALL data
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

		// Get buyer user details
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

		const buyerEmailsArray = Array.from(allBuyerEmails)
		const buyerUsers = buyerEmailsArray.length > 0
			? await Users.find({ email: { $in: buyerEmailsArray } }).select('_id firstName lastName email').lean()
			: []
		const buyerEventUsers = buyerEmailsArray.length > 0
			? await EventUsers.find({ email: { $in: buyerEmailsArray } }).select('_id firstName lastName email').lean()
			: []

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

		// Merge Data
		const breakdown = trafficStats.map((traffic: any) => {
			const code = (traffic._id === null || traffic._id === "direct" || !traffic._id) ? "Direct / No Code" : traffic._id
			const salesData = bookingStats.find((b: any) => {
				const saleCode = (b._id === null || !b._id) ? "direct" : String(b._id).toLowerCase()
				const trafficCode = (traffic._id === null || traffic._id === "direct" || !traffic._id) ? "direct" : String(traffic._id).toLowerCase()
				return saleCode === trafficCode
			}) || { totalSales: 0, totalRevenue: 0, ticketCount: 0, buyers: [] }

			// Get logged-in user details
			const loggedInUsersSet = new Set<string>()
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
				loggedInUserDetails: loggedInUsers,
				sales: salesData.totalSales,
				ticketsSold: salesData.ticketCount,
				revenue: salesData.totalRevenue,
			}
		})

		// Add codes that had sales but no tracked views
		bookingStats.forEach((sale: any) => {
			const saleCode = (sale._id === null || !sale._id) ? "direct" : String(sale._id).toLowerCase()
			const existsInTraffic = trafficStats.find((t: any) => {
				const trafficCode = (t._id === null || t._id === "direct" || !t._id) ? "direct" : String(t._id).toLowerCase()
				return trafficCode === saleCode
			})

			if (!existsInTraffic) {
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
					loggedInUserDetails: loggedInBuyers,
					sales: sale.totalSales,
					ticketsSold: sale.ticketCount,
					revenue: sale.totalRevenue,
				})
			}
		})

		// Sort by views descending
		const sortedBreakdown = breakdown.sort((a, b) => b.views - a.views)

		// Prepare Excel data
		const excelData = sortedBreakdown.map((row) => ({
			"Source (Ref Code)": row.referralCode,
			"Views": row.views,
			"Unique Visitors": row.uniqueVisitors,
			"Logged-in Users Count": row.identifiedUsers,
			"Logged-in Users": row.loggedInUserDetails.map((u: any) => `${u.name} (${u.email})`).join("; "),
			"Sales": row.sales,
			"Tickets Sold": row.ticketsSold,
			"Revenue": `$${row.revenue.toFixed(2)}`,
		}))

		// Create workbook and worksheet
		const wb = XLSX.utils.book_new()
		const ws = XLSX.utils.json_to_sheet(excelData)

		// Set column widths
		const colWidths = [
			{ wch: 30 }, // Source (Ref Code)
			{ wch: 10 }, // Views
			{ wch: 15 }, // Unique Visitors
			{ wch: 20 }, // Logged-in Users Count
			{ wch: 50 }, // Logged-in Users
			{ wch: 10 }, // Sales
			{ wch: 15 }, // Tickets Sold
			{ wch: 15 }, // Revenue
		]
		ws['!cols'] = colWidths

		XLSX.utils.book_append_sheet(wb, ws, "Marketing Performance")

		// Generate Excel buffer
		const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

		// Set response headers for file download
		const fileName = `Marketing-Stats-${eventName}-${new Date().toISOString().split('T')[0]}.xlsx`
		res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)
		res.setHeader("Content-Length", excelBuffer.length)

		// Send the file
		return res.send(excelBuffer)

	} catch (error: any) {
		console.error("Excel Export Error:", error)
		return sendResponse(res, null, error.message || "Failed to export Excel file", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

