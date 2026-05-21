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

		const grouped = await EventInteraction.aggregate([
			{ $match: match },
			{ $group: { _id: "$interactionType", sessions: { $addToSet: "$sessionId" } } },
		])

		const counts: Record<string, number> = { view: 0, ticket_select: 0, booking_start: 0, share: 0, click: 0 }
		for (const g of grouped) counts[g._id] = (g.sessions as any[]).length

		const bookingMatch: any = { status: { $in: ["confirmed", "approved"] } }
		if (eventId) bookingMatch.eventId = new Types.ObjectId(eventId)
		const bookingComplete = await Bookings.countDocuments(bookingMatch).catch(() => 0)

		const funnel = [
			{ stage: "view", label: "Viewed event", count: counts.view },
			{ stage: "ticket_select", label: "Selected ticket", count: counts.ticket_select },
			{ stage: "booking_start", label: "Started booking", count: counts.booking_start },
			{ stage: "booking_complete", label: "Completed booking", count: bookingComplete },
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
