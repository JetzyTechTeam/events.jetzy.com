import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { authOptions } from "../auth/[...nextauth]"
import { buildBookerMatchClauses } from "@/lib/booking-identity"
import { bookingMoneyAmount, bookingMoneyState, canGuestCancel } from "@/lib/booking-cancellation"
import { isCancelledBooking, isPendingBooking } from "@/lib/booking-status"
import { getEventStatus, sortEvents } from "@/utils/eventSort"
import { Types } from "mongoose"

export type MyBookingsFilter = "all" | "upcoming" | "past" | "pending" | "confirmed" | "cancelled"

const VALID_FILTERS: MyBookingsFilter[] = ["all", "upcoming", "past", "pending", "confirmed", "cancelled"]

/**
 * A single guest has tens of bookings, not thousands, so the whole set is loaded and then
 * filtered/sorted/paginated in memory. That is deliberate: "upcoming vs past" depends on
 * `getEventStatus`, which is timezone-aware and lives in JS — reimplementing it inside an
 * aggregation pipeline would be a second source of truth that silently drifts.
 */
const MAX_BOOKINGS = 500

// Fields a guest may see about their own event. Everything else — ownerId, draftRevision,
// referral internals — stays server-side. `questions` is included so the detail modal can
// label the guest's own answers; `tickets` so it can name the rows they bought.
const EVENT_FIELDS =
	"_id name slug images location locationDisclosedAfterBooking startsOn endsOn hasStartTime hasEndTime timezone datePoll premium tickets questions isDeleted createdAt"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Not authenticated", false, ResCode.UNAUTHORIZED)
		}

		const orClauses = buildBookerMatchClauses(session)
		if (orClauses.length === 0) {
			// No identity to match on. Return an empty page rather than every booking ever made.
			return sendResponse(res, { items: [], pagination: { total: 0, page: 1, limit: 12, totalPages: 0 }, counts: {} }, "OK", true, ResCode.OK)
		}

		const filter = (VALID_FILTERS as string[]).includes(req.query.filter as string)
			? (req.query.filter as MyBookingsFilter)
			: "all"
		const page = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1)
		const limit = Math.min(48, Math.max(1, parseInt((req.query.limit as string) || "12", 10) || 12))
		const search = ((req.query.search as string) || "").trim().toLowerCase()

		const bookings = await Bookings.find(
			{ isDeleted: false, $or: orClauses },
			// Stripe identifiers are never exposed to a browser — same hardening as
			// get-bookings.ts and event-bookings.ts.
			{ "payment.paymentIntentId": 0, "payment.checkoutSessionId": 0 },
		)
			.sort({ createdAt: -1 })
			.limit(MAX_BOOKINGS)
			.lean()

		// Cast explicitly rather than leaning on Mongoose's implicit string→ObjectId coercion:
		// a single malformed eventId would otherwise throw a CastError and fail the whole page.
		const eventIds = Array.from(new Set(bookings.map((b: any) => String(b.eventId))))
			.filter((id) => Types.ObjectId.isValid(id))
			.map((id) => new Types.ObjectId(id))
		const events = await Events.find({ _id: { $in: eventIds } }, EVENT_FIELDS).lean()
		const eventMap = new Map(events.map((e: any) => [String(e._id), e]))

		const now = Date.now()

		// Bookings whose event was hard-deleted have nothing to show; drop them.
		const rows = bookings
			.map((booking: any) => {
				const event = eventMap.get(String(booking.eventId))
				if (!event) return null

				const moneyState = bookingMoneyState(booking)
				const eligibility = canGuestCancel(booking, event, now)

				return {
					...booking,
					event,
					eventStatus: getEventStatus(event, now),
					moneyState,
					// What is actually at stake: the authorized/captured figure when there is a
					// payment, the booking total otherwise. `total` alone would understate a
					// booking whose Stripe amount and stored total drifted.
					moneyAmount: bookingMoneyAmount(booking),
					canCancel: eligibility.allowed,
					cancelBlockedReason: eligibility.reason,
					ticketCount: (booking.tickets || []).reduce((sum: number, t: any) => sum + (Number(t.quantity) || 0), 0),
				}
			})
			.filter(Boolean) as any[]

		// "Confirmed" is defined by exclusion rather than by listing statuses. The mobile app
		// and the admin portal write to this same collection and have put values in `status`
		// that BookingStatus doesn't declare (`checked_in` is live in production today) — an
		// allowlist would silently drop those bookings out of every filter.
		const isConfirmedLike = (r: any) => !isPendingBooking(r) && !isCancelledBooking(r)

		const counts = {
			all: rows.length,
			upcoming: rows.filter((r) => r.eventStatus !== "past" && !isCancelledBooking(r)).length,
			past: rows.filter((r) => r.eventStatus === "past").length,
			pending: rows.filter((r) => isPendingBooking(r)).length,
			confirmed: rows.filter(isConfirmedLike).length,
			cancelled: rows.filter((r) => isCancelledBooking(r)).length,
		}

		let filtered = rows
		switch (filter) {
			case "upcoming":
				// A cancelled booking is not something you're attending, even if the event is ahead.
				filtered = rows.filter((r) => r.eventStatus !== "past" && !isCancelledBooking(r))
				break
			case "past":
				filtered = rows.filter((r) => r.eventStatus === "past")
				break
			case "pending":
				filtered = rows.filter((r) => isPendingBooking(r))
				break
			case "confirmed":
				filtered = rows.filter(isConfirmedLike)
				break
			case "cancelled":
				filtered = rows.filter((r) => isCancelledBooking(r))
				break
		}

		if (search) {
			filtered = filtered.filter(
				(r) =>
					String(r.event?.name || "").toLowerCase().includes(search) ||
					String(r.bookingRef || "").toLowerCase().includes(search),
			)
		}

		// Reuse the canonical ordering (live → future → tbd → past) rather than a second
		// sort rule. sortEvents only reads the date fields, so the booking rides along.
		const sorted = sortEvents(filtered.map((row) => ({ ...row.event, __row: row })), now).map((s: any) => s.__row)

		const total = sorted.length
		const totalPages = Math.ceil(total / limit)
		const items = sorted.slice((page - 1) * limit, page * limit)

		return sendResponse(res, { items, pagination: { total, page, limit, totalPages }, counts }, "OK", true, ResCode.OK)
	} catch (error: any) {
		console.error("[bookings/mine] Failed:", error)
		return sendResponse(res, null, `Failed to load bookings: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
