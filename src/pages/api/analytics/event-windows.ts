import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"
import { Events } from "@/models/events"
import { BookingStatus } from "@/models/events/types"
import { Bookings as BookingsModel } from "@/models/events/bookings"
import { CheckIn } from "@/models/checkIn"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { WaitingList } from "@/models/waitingList"
import { AlbumView } from "@/models/events/album-view"
import { EventInteraction } from "@/models/analytics"
import {
	WINDOW_KEYS,
	buildWindows,
	countByWindow,
	distinctCountByWindow,
	sumByWindow,
	type ReportWindow,
	type WindowKey,
} from "@/lib/analytics-windows"

/**
 * The CEO's "Daily Users Overview" shape — Last 24h / 7 / 30 / 60 days — for ONE event.
 *
 * The emailed report at /api/analytics/ceo-report-summary answers "how is the platform doing".
 * A host looking at their own event needs the same question answered about that event, in the
 * same columns, or the two can't be read side by side. Window construction is imported from
 * @/lib/analytics-windows precisely so the boundaries cannot drift apart.
 *
 * Unlike the platform report this is SESSION authenticated (admin or the event's owner), not
 * secret-header authenticated — the caller here is a browser.
 *
 * Deliberately NOT filtered by the page's date-range picker: the whole point of these columns
 * is a fixed, comparable set of windows. The picker still drives everything else on the page.
 */

interface BookingWindowStats {
	created: number
	confirmed: number
	tickets: number
	revenue: number
}

// One pass over this event's bookings covering both branches (any status / confirmed only)
// across all four windows, rather than eight separate counts.
async function bookingsByWindow(eventObjectId: Types.ObjectId, windows: ReportWindow[]): Promise<Record<WindowKey, BookingWindowStats>> {
	const facet: Record<string, any[]> = {}
	for (const w of windows) {
		facet[`${w.key}_created`] = [{ $match: { createdAt: { $gte: w.from, $lte: w.to } } }, { $count: "n" }]
		facet[`${w.key}_confirmed`] = [
			{ $match: { status: BookingStatus.CONFIRMED, createdAt: { $gte: w.from, $lte: w.to } } },
			{
				$group: {
					_id: null,
					count: { $sum: 1 },
					// What the TICKET cost. Membership money rides on payment.amount and is not
					// ticket revenue — see the note in CLAUDE.md on booking.total ≠ payment.amount.
					revenue: { $sum: "$total" },
					tickets: { $sum: { $reduce: { input: "$tickets", initialValue: 0, in: { $add: ["$$value", "$$this.quantity"] } } } },
				},
			},
		]
	}

	const [result] = await BookingsModel.aggregate([{ $match: { eventId: eventObjectId, isDeleted: false } }, { $facet: facet }])

	const out: Record<WindowKey, BookingWindowStats> = {} as any
	for (const key of WINDOW_KEYS) {
		const confirmed = result?.[`${key}_confirmed`]?.[0]
		out[key] = {
			created: result?.[`${key}_created`]?.[0]?.n || 0,
			confirmed: confirmed?.count || 0,
			tickets: confirmed?.tickets || 0,
			revenue: confirmed?.revenue || 0,
		}
	}
	return out
}

interface InteractionWindowStats {
	views: number
	viewers: number
	ticketSelect: number
	checkoutOpen: number
	checkoutSubmit: number
	shares: number
}

// Views are raw interaction rows (visits); viewers are distinct sessions (people-ish). The
// funnel stages below are counted as distinct SESSIONS too, so every stage is in the same unit
// and the drop-off between them means something.
async function interactionsByWindow(eventObjectId: Types.ObjectId, windows: ReportWindow[]): Promise<Record<WindowKey, InteractionWindowStats>> {
	const facet: Record<string, any[]> = {}
	for (const w of windows) {
		facet[w.key] = [
			{ $match: { timestamp: { $gte: w.from, $lte: w.to } } },
			{ $group: { _id: "$interactionType", rows: { $sum: 1 }, sessions: { $addToSet: "$sessionId" } } },
			{ $project: { rows: 1, sessions: { $size: "$sessions" } } },
		]
	}
	const [result] = await EventInteraction.aggregate([{ $match: { eventId: eventObjectId } }, { $facet: facet }])

	const out: Record<WindowKey, InteractionWindowStats> = {} as any
	for (const key of WINDOW_KEYS) {
		const rows: { _id: string; rows: number; sessions: number }[] = result?.[key] || []
		const byType = (t: string) => rows.find((r) => r._id === t)
		out[key] = {
			views: byType("view")?.rows || 0,
			viewers: byType("view")?.sessions || 0,
			ticketSelect: byType("ticket_select")?.sessions || 0,
			checkoutOpen: byType("booking_start")?.sessions || 0,
			checkoutSubmit: byType("checkout_submit")?.sessions || 0,
			shares: byType("share")?.rows || 0,
		}
	}
	return out
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query as { eventId?: string }
		if (!eventId || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "A valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		// Admin OR owner — same guard as every other per-event analytics route.
		const event = await Events.findById(eventId, { ownerId: 1 }).lean()
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. You can only view analytics for your own events.", false, ResCode.FORBIDDEN)
		}

		const eventObjectId = new Types.ObjectId(eventId)
		const now = new Date()
		const windows = buildWindows(now)

		const [bookings, interactions, checkIns, discussion, waitlist, albumVisitors] = await Promise.all([
			bookingsByWindow(eventObjectId, windows),
			interactionsByWindow(eventObjectId, windows),
			// Attributed to when the check-in ROW was created. A guest re-scanned later appends to
			// checkInHistory without moving createdAt, so heavy multi-scan events will read low here.
			sumByWindow(CheckIn, "createdAt", "checkedInCount", windows, { eventId: eventObjectId }),
			countByWindow(DiscussionPosts as any, "createdAt", windows, { eventId: eventObjectId }),
			countByWindow(WaitingList as any, "createdAt", windows, { eventId: eventObjectId }),
			// People who opened one of this event's albums — identified or not. Rows written before
			// album view tracking existed simply aren't there, which reads as no traffic rather than
			// none; that is why the UI hides the row when every window is zero.
			distinctCountByWindow(AlbumView, "createdAt", "anonId", windows, { eventId: eventObjectId }),
		])

		const summary: Record<WindowKey, Record<string, number>> = {} as any
		for (const key of WINDOW_KEYS) {
			summary[key] = {
				"Page Views": interactions[key].views,
				"Unique Visitors": interactions[key].viewers,
				"Ticket Selections": interactions[key].ticketSelect,
				"Checkout Opened": interactions[key].checkoutOpen,
				"Checkout Submitted": interactions[key].checkoutSubmit,
				"Bookings Created": bookings[key].created,
				"Bookings Confirmed": bookings[key].confirmed,
				"Tickets Booked": bookings[key].tickets,
				"Revenue": bookings[key].revenue,
				"Check-ins": checkIns[key],
				"Shares": interactions[key].shares,
				"Discussion Posts": discussion[key],
				"Waiting List Joins": waitlist[key],
				"Album Visitors": albumVisitors[key],
			}
		}

		return sendResponse(res, { generatedAt: now.toISOString(), summary }, "Event summary retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[analytics/event-windows] Error:", error)
		return sendResponse(res, null, error?.message || "Failed to build event summary", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
