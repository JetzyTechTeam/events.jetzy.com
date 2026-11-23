import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { Types } from "mongoose"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { CheckIn } from "@/models/checkIn"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { bookingTicketTotal, liveCheckInBookingsFilter } from "@/lib/check-in-bookings"
import { authOptions } from "../auth/[...nextauth]"

/**
 * Who is behind the check-in page's tiles: one row per booking the door accepts, with how many
 * of its guests are in.
 * GET /api/check-in/list?eventId=xxx — admin OR event owner.
 *
 * Built from `Bookings` + `CheckIn`, the SAME data and the SAME population (`liveCheckInBookingsFilter`)
 * as `/api/check-in/stats`, so "Checked In: 12" opens a list that adds up to 12. The older
 * `/api/check-in/guests` reads `EventGuest`, which only the "collect guest details" flow writes —
 * scan check-ins never appear there.
 */

export type CheckInListState = "full" | "partial" | "none"

export type CheckInListRow = {
	bookingRef: string
	customerName: string
	customerEmail: string
	customerPhone: string
	tickets: string[]
	totalTickets: number
	checkedInCount: number
	remaining: number
	state: CheckInListState
	firstCheckInAt: string | null
	lastCheckInAt: string | null
	lastCheckedInBy: string | null
}

const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : null)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query
		if (typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		const event: any = await Events.findOne(
			{ _id: new Types.ObjectId(eventId), isDeleted: false },
			{ ownerId: 1, "tickets._id": 1, "tickets.name": 1 },
		).lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}
		if (!isAdmin && event.ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. You can only view check-ins for your own events.", false, ResCode.FORBIDDEN)
		}

		// A booking stores only `ticketId`; names come from the event.
		const ticketNames = new Map<string, string>(
			(event.tickets || []).map((t: any) => [t._id?.toString(), t.name || "Ticket"]),
		)

		const bookings: any[] = await Bookings.find(liveCheckInBookingsFilter(eventId))
			.select("bookingRef customerName customerEmail customerPhone tickets")
			.lean()
		const checkIns: any[] = await CheckIn.find({ bookingId: { $in: bookings.map((b) => b._id) } }).lean()
		const checkInMap = new Map(checkIns.map((ci) => [ci.bookingId.toString(), ci]))

		const rows: CheckInListRow[] = bookings.map((booking) => {
			const checkIn = checkInMap.get(booking._id.toString())
			const totalTickets = bookingTicketTotal(booking)
			const checkedInCount = checkIn?.checkedInCount || 0
			const remaining = Math.max(0, totalTickets - checkedInCount)
			const history: any[] = checkIn?.checkInHistory || []
			return {
				bookingRef: booking.bookingRef || "",
				customerName: booking.customerName || "",
				customerEmail: booking.customerEmail || "",
				customerPhone: booking.customerPhone || "",
				tickets: (booking.tickets || [])
					.filter((t: any) => Number(t?.quantity) > 0)
					.map((t: any) => `${t.quantity}× ${ticketNames.get(t.ticketId?.toString()) || "Ticket"}`),
				totalTickets,
				checkedInCount,
				remaining,
				state: checkedInCount <= 0 ? "none" : remaining === 0 ? "full" : "partial",
				firstCheckInAt: iso(checkIn?.firstCheckInAt),
				lastCheckInAt: iso(checkIn?.lastCheckInAt),
				lastCheckedInBy: history.length ? history[history.length - 1]?.adminName || null : null,
			}
		})

		// Most recent arrivals first; everyone not yet in after them, by name.
		rows.sort((a, b) => {
			if (a.lastCheckInAt && b.lastCheckInAt) return b.lastCheckInAt.localeCompare(a.lastCheckInAt)
			if (a.lastCheckInAt) return -1
			if (b.lastCheckInAt) return 1
			return a.customerName.localeCompare(b.customerName)
		})

		return sendResponse(res, { rows }, "Check-in list retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Check-in list error:", error)
		return sendResponse(res, null, error.message || "Internal server error", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
