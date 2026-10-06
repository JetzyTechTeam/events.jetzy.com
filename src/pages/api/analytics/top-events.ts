import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { Bookings as BookingsModel } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { CheckIn } from "@/models/checkIn"
import { EventInteraction } from "@/models/analytics"
import { Users } from "@/models/userModal"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { stripHtml } from "@/utils/text"
import { interactionVisitorKey, parseDateRange, pct } from "@/lib/analytics-metrics"

/**
 * Per-event performance table for the admin analytics "Events" tab.
 *
 * Every event is listed (not only ones that sold), with traffic, funnel, bookings, tickets,
 * attendance and money side by side. The date range filters ACTIVITY — views, bookings and
 * check-ins that happened inside it — not when the event takes place; `timing` filters that.
 *
 * Sorting, filtering and paging happen here, over the whole set, so "sort by views" ranks all
 * events rather than just the current page. There are ~100s of events, so assembling the rows
 * in memory is cheaper than one giant $lookup pipeline.
 */

const SORT_KEYS = [
	"revenue",
	"gross",
	"discounts",
	"avgOrderValue",
	"bookings",
	"pendingBookings",
	"cancelledBookings",
	"tickets",
	"checkedIn",
	"checkInRate",
	"views",
	"uniqueViewers",
	"sessions",
	"ticketSelects",
	"checkoutStarts",
	"conversionRate",
	"startsOn",
	"name",
] as const
type SortKey = (typeof SORT_KEYS)[number]

type Timing = "upcoming" | "ongoing" | "past" | "undated"

const timingOf = (startsOn: Date | null, endsOn: Date | null, now: Date): Timing => {
	if (!startsOn) return "undated"
	if (startsOn > now) return "upcoming"
	const end = endsOn || startsOn
	return end < now ? "past" : "ongoing"
}

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

		const q = req.query as Record<string, string | undefined>
		const limitNum = parseInt(q.limit || "10", 10)
		const pageNum = parseInt(q.page || "1", 10)
		if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
			return sendResponse(res, null, "Invalid limit (1-100)", false, ResCode.BAD_REQUEST)
		}
		if (isNaN(pageNum) || pageNum < 1) {
			return sendResponse(res, null, "Invalid page (must be >= 1)", false, ResCode.BAD_REQUEST)
		}
		const sortBy: SortKey = (SORT_KEYS as readonly string[]).includes(q.sortBy || "") ? (q.sortBy as SortKey) : "revenue"
		const sortDir: 1 | -1 = q.sortDir === "asc" ? 1 : -1
		const search = (q.search || "").trim().toLowerCase()
		const timing = q.timing && q.timing !== "all" ? q.timing : null
		const privacy = q.privacy === "public" || q.privacy === "private" ? q.privacy : null
		const pricing = q.pricing === "paid" || q.pricing === "free" ? q.pricing : null
		const activeOnly = q.activeOnly === "true"

		const range = parseDateRange(q)
		const bookingMatch: any = { isDeleted: false }
		if (range) bookingMatch.createdAt = range
		const interactionMatch: any = {}
		if (range) interactionMatch.timestamp = range

		const eventQuery: any = { isDeleted: false }
		if (privacy) eventQuery.privacy = privacy
		if (pricing) eventQuery.isPaid = pricing === "paid"

		const [allEvents, bookingsByEvent, confirmedBookingIds, interactionsByEvent] = await Promise.all([
			Events.find(eventQuery).select("_id name slug images startsOn endsOn privacy isPaid status ownerId").lean(),
			BookingsModel.aggregate([
				{ $match: bookingMatch },
				{
					$group: {
						_id: "$eventId",
						confirmed: { $sum: { $cond: [{ $eq: ["$status", BookingStatus.CONFIRMED] }, 1, 0] } },
						pending: {
							$sum: { $cond: [{ $in: ["$status", [BookingStatus.PENDING, BookingStatus.APPROVED]] }, 1, 0] },
						},
						cancelled: {
							$sum: { $cond: [{ $in: ["$status", [BookingStatus.CANCELLED, BookingStatus.REJECTED]] }, 1, 0] },
						},
						refunded: { $sum: { $cond: [{ $eq: ["$status", BookingStatus.REFUNDED] }, 1, 0] } },
						failed: { $sum: { $cond: [{ $eq: ["$status", BookingStatus.FAILED] }, 1, 0] } },
						// Money and tickets count CONFIRMED bookings only.
						net: { $sum: { $cond: [{ $eq: ["$status", BookingStatus.CONFIRMED] }, { $ifNull: ["$total", 0] }, 0] } },
						gross: { $sum: { $cond: [{ $eq: ["$status", BookingStatus.CONFIRMED] }, { $ifNull: ["$subTotal", 0] }, 0] } },
						discounts: {
							$sum: { $cond: [{ $eq: ["$status", BookingStatus.CONFIRMED] }, { $ifNull: ["$discountAmount", 0] }, 0] },
						},
						tickets: {
							$sum: {
								$cond: [
									{ $eq: ["$status", BookingStatus.CONFIRMED] },
									{ $reduce: { input: { $ifNull: ["$tickets", []] }, initialValue: 0, in: { $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }] } } },
									0,
								],
							},
						},
					},
				},
			]),
			BookingsModel.find({ ...bookingMatch, status: BookingStatus.CONFIRMED }).select("_id").lean(),
			EventInteraction.aggregate([
				{ $match: interactionMatch },
				{
					$group: {
						_id: "$eventId",
						views: { $sum: { $cond: [{ $eq: ["$interactionType", "view"] }, 1, 0] } },
						viewers: { $addToSet: { $cond: [{ $eq: ["$interactionType", "view"] }, interactionVisitorKey, "$$REMOVE"] } },
						sessions: { $addToSet: "$sessionId" },
						ticketSelects: { $sum: { $cond: [{ $eq: ["$interactionType", "ticket_select"] }, 1, 0] } },
						checkoutStarts: { $sum: { $cond: [{ $eq: ["$interactionType", "booking_start"] }, 1, 0] } },
					},
				},
				{
					$project: {
						views: 1,
						ticketSelects: 1,
						checkoutStarts: 1,
						uniqueViewers: { $size: "$viewers" },
						sessions: { $size: "$sessions" },
					},
				},
			]),
		])

		// Attendance: guests checked in against CONFIRMED bookings made in the range, so the
		// numerator and denominator (tickets sold) describe the same set of bookings.
		const confirmedSet = new Set(confirmedBookingIds.map((b: any) => b._id.toString()))
		const checkIns = await CheckIn.find({ eventId: { $in: allEvents.map((e: any) => e._id) } })
			.select("eventId bookingId checkedInCount")
			.lean()
		const checkedInMap = new Map<string, number>()
		for (const c of checkIns as any[]) {
			if (!c.bookingId || !confirmedSet.has(c.bookingId.toString())) continue
			const key = c.eventId.toString()
			checkedInMap.set(key, (checkedInMap.get(key) || 0) + (Number(c.checkedInCount) || 0))
		}

		const ownerIds = Array.from(new Set(allEvents.map((e: any) => e.ownerId?.toString()).filter(Boolean)))
		const owners = await Users.find({ _id: { $in: ownerIds } }).select("firstName lastName email").lean()
		const ownerMap = new Map(owners.map((u: any) => [u._id.toString(), u]))

		const bookingMap = new Map(bookingsByEvent.map((b: any) => [b._id?.toString(), b]))
		const interactionMap = new Map(interactionsByEvent.map((i: any) => [i._id?.toString(), i]))

		const now = new Date()
		const round2 = (n: number) => Math.round(n * 100) / 100

		let rows = allEvents.map((event: any) => {
			const id = event._id.toString()
			const b = bookingMap.get(id) || {}
			const i = interactionMap.get(id) || {}
			const owner = event.ownerId ? ownerMap.get(event.ownerId.toString()) : null
			const confirmed = b.confirmed || 0
			const tickets = b.tickets || 0
			const checkedIn = checkedInMap.get(id) || 0
			const uniqueViewers = i.uniqueViewers || 0
			const net = round2(b.net || 0)
			const startsOn = event.startsOn ? new Date(event.startsOn) : null
			const endsOn = event.endsOn ? new Date(event.endsOn) : null
			return {
				eventId: id,
				name: stripHtml(event.name || "") || "Untitled event",
				slug: event.slug,
				image: event.images?.[0] || null,
				startsOn: startsOn ? startsOn.toISOString() : null,
				endsOn: endsOn ? endsOn.toISOString() : null,
				timing: timingOf(startsOn, endsOn, now),
				privacy: event.privacy || "public",
				isPaid: !!event.isPaid,
				isDraft: event.status === "draft",
				host: owner ? { name: `${owner.firstName || ""} ${owner.lastName || ""}`.trim() || owner.email, email: owner.email } : null,
				traffic: {
					views: i.views || 0,
					uniqueViewers,
					sessions: i.sessions || 0,
					ticketSelects: i.ticketSelects || 0,
					checkoutStarts: i.checkoutStarts || 0,
				},
				bookings: {
					confirmed,
					pending: b.pending || 0,
					cancelled: b.cancelled || 0,
					refunded: b.refunded || 0,
					failed: b.failed || 0,
				},
				tickets: {
					sold: tickets,
					checkedIn,
					checkInRate: pct(checkedIn, tickets),
				},
				revenue: {
					gross: round2(b.gross || 0),
					discounts: round2(b.discounts || 0),
					net,
					avgOrderValue: confirmed > 0 ? round2(net / confirmed) : 0,
				},
				// Confirmed bookings per unique viewer. Can exceed 100% when bookings arrive
				// without a tracked page view (direct checkout links, the mobile app).
				conversionRate: pct(confirmed, uniqueViewers),
			}
		})

		if (timing) rows = rows.filter((r) => r.timing === timing)
		if (search) rows = rows.filter((r) => r.name.toLowerCase().includes(search) || r.slug?.toLowerCase().includes(search) || r.host?.name.toLowerCase().includes(search))
		if (activeOnly) rows = rows.filter((r) => r.traffic.views > 0 || r.bookings.confirmed + r.bookings.pending + r.bookings.cancelled > 0)

		const sortValue = (r: (typeof rows)[number]): number | string => {
			switch (sortBy) {
				case "revenue": return r.revenue.net
				case "gross": return r.revenue.gross
				case "discounts": return r.revenue.discounts
				case "avgOrderValue": return r.revenue.avgOrderValue
				case "bookings": return r.bookings.confirmed
				case "pendingBookings": return r.bookings.pending
				case "cancelledBookings": return r.bookings.cancelled
				case "tickets": return r.tickets.sold
				case "checkedIn": return r.tickets.checkedIn
				case "checkInRate": return r.tickets.checkInRate
				case "views": return r.traffic.views
				case "uniqueViewers": return r.traffic.uniqueViewers
				case "sessions": return r.traffic.sessions
				case "ticketSelects": return r.traffic.ticketSelects
				case "checkoutStarts": return r.traffic.checkoutStarts
				case "conversionRate": return r.conversionRate
				case "startsOn": return r.startsOn ? new Date(r.startsOn).getTime() : sortDir === 1 ? Infinity : -Infinity
				case "name": return r.name.toLowerCase()
			}
		}
		rows.sort((a, b) => {
			const va = sortValue(a)
			const vb = sortValue(b)
			const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number)
			// Stable tie-break: bookings, then name, so equal rows don't shuffle between pages.
			return cmp * sortDir || b.bookings.confirmed - a.bookings.confirmed || a.name.localeCompare(b.name)
		})

		// Totals across the FILTERED set (every page), so the summary matches the table.
		const totals = rows.reduce(
			(t, r) => {
				t.views += r.traffic.views
				t.uniqueViewers += r.traffic.uniqueViewers
				t.sessions += r.traffic.sessions
				t.bookings += r.bookings.confirmed
				t.pendingBookings += r.bookings.pending
				t.tickets += r.tickets.sold
				t.checkedIn += r.tickets.checkedIn
				t.gross += r.revenue.gross
				t.discounts += r.revenue.discounts
				t.revenue += r.revenue.net
				return t
			},
			{ events: rows.length, views: 0, uniqueViewers: 0, sessions: 0, bookings: 0, pendingBookings: 0, tickets: 0, checkedIn: 0, gross: 0, discounts: 0, revenue: 0 }
		)
		totals.gross = round2(totals.gross)
		totals.discounts = round2(totals.discounts)
		totals.revenue = round2(totals.revenue)

		const total = rows.length
		const totalPages = Math.max(1, Math.ceil(total / limitNum))
		const safePage = Math.min(pageNum, totalPages)
		const skip = (safePage - 1) * limitNum

		return sendResponse(
			res,
			{
				events: q.all === "true" ? rows : rows.slice(skip, skip + limitNum),
				totals: { ...totals, checkInRate: pct(totals.checkedIn, totals.tickets), conversionRate: pct(totals.bookings, totals.uniqueViewers) },
				pagination: {
					page: safePage,
					limit: limitNum,
					total,
					totalPages,
					hasNextPage: safePage < totalPages,
					hasPreviousPage: safePage > 1,
				},
				sortBy,
				sortDir: sortDir === 1 ? "asc" : "desc",
				dateRange: { from: range?.$gte?.toISOString() || null, to: range?.$lte?.toISOString() || null },
			},
			"Event performance retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Analytics Top Events] Error:", error)
		return sendResponse(res, null, error.message || "Failed to fetch top events", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
