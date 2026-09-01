import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { EventInteraction } from "@/models/analytics"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const userId = (session.user as any)?._id?.toString()

		const { eventId } = req.query as Record<string, string>

		const match: any = {}
		if (eventId) {
			if (!Types.ObjectId.isValid(eventId)) {
				return sendResponse(res, null, "Invalid eventId", false, ResCode.BAD_REQUEST)
			}
			if (!isAdmin) {
				const ev = await Events.findById(eventId, { ownerId: 1 }).lean()
				if (!ev || (ev as any).ownerId?.toString() !== userId) {
					return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)
				}
			}
			match.eventId = new Types.ObjectId(eventId)
		} else if (!isAdmin) {
			return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)
		}

		// Optional date bounds, so the funnel answers the same question as the rest of the page.
		// Without these it always described all time while every tile beside it was filtered.
		const { dateFrom, dateTo } = req.query as Record<string, string>
		const dateFilter: any = {}
		if (dateFrom) {
			const d = new Date(dateFrom)
			d.setHours(0, 0, 0, 0)
			dateFilter.$gte = d
		}
		if (dateTo) {
			const d = new Date(dateTo)
			d.setHours(23, 59, 59, 999)
			dateFilter.$lte = d
		}
		const hasDates = Object.keys(dateFilter).length > 0
		if (hasDates) match.timestamp = dateFilter

		const grouped = await EventInteraction.aggregate([
			{ $match: match },
			{ $group: { _id: "$interactionType", sessions: { $addToSet: "$sessionId" } } },
		])

		const counts: Record<string, number> = { view: 0, ticket_select: 0, booking_start: 0, checkout_submit: 0, share: 0, click: 0 }
		for (const g of grouped) counts[g._id] = (g.sessions as any[]).length

		// EVERY STAGE IS A DISTINCT SESSION COUNT. The booking stage used to be a raw
		// countDocuments, so one visitor buying three times showed as three "completed" against
		// one "viewed" — a funnel that could exceed 100% and a drop-off figure that meant nothing.
		// Bookings carry the sessionId that produced them only sometimes, so fall back to counting
		// distinct buyers, which is still people rather than rows.
		const bookingMatch: any = { status: { $in: ["confirmed", "approved"] }, isDeleted: false }
		if (eventId) bookingMatch.eventId = new Types.ObjectId(eventId)
		if (hasDates) bookingMatch.createdAt = dateFilter

		const bookingBuyers = await Bookings.aggregate([
			{ $match: bookingMatch },
			// customerEmail has no `lowercase: true`, so fold case before de-duplicating or one
			// person with a capitalised address counts twice.
			{ $group: { _id: { $toLower: { $ifNull: ["$customerEmail", { $toString: "$_id" }] } } } },
			{ $count: "n" },
		]).catch(() => [] as any[])
		const bookingComplete = bookingBuyers?.[0]?.n || 0

		const funnel = [
			{ stage: "view", label: "Opened the event page", count: counts.view },
			{ stage: "ticket_select", label: "Picked a ticket", count: counts.ticket_select },
			{ stage: "booking_start", label: "Opened checkout", count: counts.booking_start },
			{ stage: "checkout_submit", label: "Submitted checkout", count: counts.checkout_submit },
			{ stage: "booking_complete", label: "Booked", count: bookingComplete },
		]

		const withRates = funnel.map((stage, i) => {
			const prev = i > 0 ? funnel[i - 1].count : stage.count
			const dropOff = prev > 0 ? ((prev - stage.count) / prev) * 100 : 0
			const conversionFromTop = funnel[0].count > 0 ? (stage.count / funnel[0].count) * 100 : 0
			return { ...stage, dropOffPct: Math.max(0, Math.round(dropOff * 10) / 10), conversionPct: Math.round(conversionFromTop * 10) / 10 }
		})

		return sendResponse(res, { funnel: withRates }, "Funnel retrieved", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Journey Funnel] Error:", error)
		return sendResponse(res, null, error.message || "Failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
