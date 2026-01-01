import { sendResponse, stripHTMLAndDecode } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventTraffic } from "@/models/events/event-traffic"
import { Bookings } from "@/models/events/bookings"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../../auth/[...nextauth]"
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
		const { eventId, referralCode } = req.query

		if (!eventId || !referralCode) {
			return sendResponse(res, null, "eventId and referralCode are required", false, ResCode.BAD_REQUEST)
		}

		// Validate event ownership
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
			return sendResponse(res, null, "You don't have permission to export this event's user data", false, ResCode.FORBIDDEN)
		}

		const eventIdObj = new Types.ObjectId(eventId as string)
		// Normalize referral code - handle "Direct / No Code" and null cases
		const refCodeStr = String(referralCode)
		const normalizedReferralCode = (refCodeStr === "Direct / No Code" || refCodeStr === "direct" || refCodeStr === "null" || !referralCode) 
			? null 
			: refCodeStr

		// Build match condition for referral code
		const referralCodeMatch = normalizedReferralCode === null 
			? { $in: [null, "direct"] } 
			: normalizedReferralCode

		// Get all unique user IDs from traffic for this referral code
		const trafficStats = await EventTraffic.aggregate([
			{ 
				$match: { 
					eventId: eventIdObj,
					referralCode: referralCodeMatch
				} 
			},
			{
				$group: {
					_id: null,
					uniqueUserIds: { $addToSet: "$userId" }
				}
			}
		])

		// Get all unique user IDs
		const allUniqueUserIds = new Set<Types.ObjectId>()
		if (trafficStats.length > 0 && trafficStats[0].uniqueUserIds) {
			trafficStats[0].uniqueUserIds.forEach((uid: any) => {
				if (uid && uid !== null && uid !== undefined) {
					allUniqueUserIds.add(new Types.ObjectId(uid))
				}
			})
		}

		// Fetch user details from Users and EventUsers
		const userIdsArray = Array.from(allUniqueUserIds)
		const users = userIdsArray.length > 0 
			? await Users.find({ _id: { $in: userIdsArray } }).select('firstName lastName email').lean() 
			: []
		const eventUsers = userIdsArray.length > 0 
			? await EventUsers.find({ _id: { $in: userIdsArray } }).select('firstName lastName email').lean() 
			: []

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

		// Get logged-in users from traffic
		const loggedInUsersSet = new Set<string>()
		const loggedInUsers: Array<{ name: string; email: string }> = []

		userIdsArray.forEach((uid) => {
			const userIdStr = uid.toString()
			const userDetails = userMap.get(userIdStr)
			if (userDetails && !loggedInUsersSet.has(userDetails.email.toLowerCase())) {
				loggedInUsersSet.add(userDetails.email.toLowerCase())
				loggedInUsers.push(userDetails)
			}
		})

		// Get buyers from bookings for this referral code
		const bookingStats = await Bookings.aggregate([
			{
				$match: {
					eventId: eventIdObj,
					status: "confirmed",
					isDeleted: false,
					referralCode: referralCodeMatch
				}
			},
			{
				$group: {
					_id: null,
					buyers: { $addToSet: "$customerEmail" }
				}
			}
		])

		// Get buyer user details
		const allBuyerEmails = new Set<string>()
		if (bookingStats.length > 0 && bookingStats[0].buyers) {
			bookingStats[0].buyers.forEach((email: string) => {
				if (email && email.trim()) {
					allBuyerEmails.add(email.toLowerCase().trim())
				}
			})
		}

		const buyerEmailsArray = Array.from(allBuyerEmails)
		const buyerUsers = buyerEmailsArray.length > 0
			? await Users.find({ email: { $in: buyerEmailsArray } }).select('firstName lastName email').lean()
			: []
		const buyerEventUsers = buyerEmailsArray.length > 0
			? await EventUsers.find({ email: { $in: buyerEmailsArray } }).select('firstName lastName email').lean()
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

		// Add buyers who aren't already in the list
		buyerEmailsArray.forEach((email) => {
			const buyerDetails = buyerEmailMap.get(email)
			if (buyerDetails && !loggedInUsersSet.has(buyerDetails.email.toLowerCase())) {
				loggedInUsersSet.add(buyerDetails.email.toLowerCase())
				loggedInUsers.push(buyerDetails)
			}
		})

		// Sort users by name
		loggedInUsers.sort((a, b) => a.name.localeCompare(b.name))

		// Prepare Excel data
		const excelData = loggedInUsers.map((user, index) => ({
			"#": index + 1,
			"Name": user.name,
			"Email": user.email,
		}))

		// Create workbook and worksheet
		const wb = XLSX.utils.book_new()
		const ws = XLSX.utils.json_to_sheet(excelData)

		// Set column widths
		const colWidths = [
			{ wch: 8 },  // #
			{ wch: 30 }, // Name
			{ wch: 40 }, // Email
		]
		ws['!cols'] = colWidths

		// Add summary info as a second sheet
		const summaryData = [
			{ "Metric": "Source (Ref Code)", "Value": referralCode || "Direct / No Code" },
			{ "Metric": "Total Logged-in Users", "Value": loggedInUsers.length },
			{ "Metric": "Export Date", "Value": new Date().toISOString().split('T')[0] },
		]
		const summaryWs = XLSX.utils.json_to_sheet(summaryData)
		summaryWs['!cols'] = [{ wch: 25 }, { wch: 30 }]

		XLSX.utils.book_append_sheet(wb, ws, "Users")
		XLSX.utils.book_append_sheet(wb, summaryWs, "Summary")

		// Generate Excel buffer
		const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

		// Set response headers for file download - strip HTML and clean names
		const rawEventName = (requestedEvent as any).name || "Event"
		const cleanedEventName = stripHTMLAndDecode(rawEventName)
		const safeEventName = cleanedEventName.replace(/[^a-z0-9]/gi, '_').substring(0, 30) || "Event"
		
		const rawReferralCode = String(referralCode)
		const cleanedReferralCode = stripHTMLAndDecode(rawReferralCode)
		const safeReferralCode = cleanedReferralCode.replace(/[^a-z0-9]/gi, '_').substring(0, 30)
		
		const fileName = `Logged-in-Users-${safeEventName}-${safeReferralCode}-${new Date().toISOString().split('T')[0]}.xlsx`
		
		res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)
		res.setHeader("Content-Length", excelBuffer.length)

		// Send the file
		return res.send(excelBuffer)

	} catch (error: any) {
		console.error("Users Excel Export Error:", error)
		return sendResponse(res, null, error.message || "Failed to export Excel file", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

