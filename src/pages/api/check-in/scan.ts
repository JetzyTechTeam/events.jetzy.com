import { NextApiRequest, NextApiResponse } from "next"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { escapeRegExp } from "@/utils/text"
import { Bookings } from "@/models/events/bookings"
import { CheckIn } from "@/models/checkIn"
import { Events } from "@/models/events"
import { isCancelledBooking, isPendingBooking } from "@/lib/booking-status"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export type ScanOutcome = "checked_in" | "already_full" | "pending" | "cancelled" | "not_found" | "not_ticket"

/**
 * Fast door check-in: ONE scan of a guest's QR checks in ONE guest (2026-11-18).
 *
 * POST /api/check-in/scan  { eventId, bookingRef }
 *
 * The QR on the confirmation email and the success screens is the bare `bookingRef`. A booking for
 * three people is one QR, scanned three times — each scan seats the next guest, and a fourth says
 * everyone is already in. Replaces validate + record for a scan, in one round trip, because at the
 * door there is no time for a confirm step.
 *
 * The +1 is ATOMIC: a conditional `$inc` that only matches while `checkedInCount < total`. Two
 * phones scanning the same QR at once, or a scan that fires twice, can never seat more guests than
 * the booking holds — `record.ts` is read-modify-write and would let both through. Relies on the
 * unique index on `checkins.bookingId` for the first-scan upsert.
 *
 * `checked_in` and `already_full` are results to show (status true); the refusals are status false
 * with the `outcome` in `data`, so the scanner can colour the banner without parsing messages.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
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

		const eventId = typeof req.body?.eventId === "string" ? req.body.eventId : ""
		const scanned = typeof req.body?.bookingRef === "string" ? req.body.bookingRef.trim() : ""

		if (!eventId || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "A valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		if (!isAdmin) {
			const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }, { ownerId: 1 }).lean()
			if (!event || (event as any).ownerId?.toString() !== userId) {
				return sendResponse(res, null, "Access denied. You can only check in guests for your own events.", false, ResCode.FORBIDDEN)
			}
		}

		// Anything that isn't a booking reference — the walk-in buy-link QR, a URL, random text.
		if (!/^JZ-/i.test(scanned) || scanned.length > 64) {
			return sendResponse(res, { outcome: "not_ticket" as ScanOutcome }, "This isn't a Jetzy ticket QR code.", false, ResCode.BAD_REQUEST)
		}

		const booking = await Bookings.findOne({
			eventId: new Types.ObjectId(eventId),
			bookingRef: { $regex: new RegExp(`^${escapeRegExp(scanned)}$`, "i") },
			// `$ne: true`, not `false` — rows written by the mobile app may carry no such field.
			isDeleted: { $ne: true },
		}).lean()

		if (!booking) {
			return sendResponse(res, { outcome: "not_found" as ScanOutcome }, "No booking for this event matches this QR code.", false, ResCode.NOT_FOUND)
		}

		const base = {
			bookingRef: (booking as any).bookingRef,
			customerName: (booking as any).customerName || "",
		}

		if (isPendingBooking(booking as any)) {
			return sendResponse(res, { outcome: "pending" as ScanOutcome, ...base }, "This booking is still waiting for host approval.", false, ResCode.BAD_REQUEST)
		}
		if (isCancelledBooking(booking as any)) {
			return sendResponse(res, { outcome: "cancelled" as ScanOutcome, ...base }, "This booking was cancelled.", false, ResCode.BAD_REQUEST)
		}

		// Same count `record.ts` and `validate.ts` use.
		const total = ((booking as any).tickets || []).reduce((sum: number, t: any) => sum + (Number(t?.quantity) || 0), 0)
		if (total < 1) {
			return sendResponse(res, { outcome: "not_found" as ScanOutcome, ...base }, "This booking has no tickets to check in.", false, ResCode.BAD_REQUEST)
		}

		const bookingId = (booking as any)._id as Types.ObjectId
		const now = new Date()

		// 1. Make sure the CheckIn row exists. Two first scans racing both try to insert; the unique
		//    index on bookingId turns the loser into an 11000, which just means the row is there.
		try {
			await CheckIn.updateOne(
				{ bookingId },
				{
					$setOnInsert: {
						bookingId,
						eventId: new Types.ObjectId(eventId),
						bookingRef: base.bookingRef,
						customerEmail: (booking as any).customerEmail || "",
						customerName: base.customerName || (booking as any).customerEmail || "Guest",
						totalTickets: total,
						checkedInCount: 0,
						checkInHistory: [],
						isFullyCheckedIn: false,
					},
				},
				{ upsert: true },
			)
		} catch (err: any) {
			if (err?.code !== 11000) throw err
		}

		// 2. Seat ONE guest, only while a seat is left.
		const updated = await CheckIn.findOneAndUpdate(
			{ bookingId, checkedInCount: { $lt: total } },
			{
				$inc: { checkedInCount: 1 },
				$push: {
					checkInHistory: {
						count: 1,
						timestamp: now,
						adminId: userId || "unknown",
						adminName: (session.user as any)?.fullName || session.user?.email || "Admin",
					},
				},
				// The booking may have been edited since the row was made; keep its total current.
				$set: { lastCheckInAt: now, totalTickets: total },
			},
			{ new: true },
		).lean()

		if (!updated) {
			const current = await CheckIn.findOne({ bookingId }, { checkedInCount: 1 }).lean()
			const checkedInCount = (current as any)?.checkedInCount ?? total
			return sendResponse(
				res,
				{ outcome: "already_full" as ScanOutcome, ...base, checkedInCount, totalTickets: total, remainingTickets: Math.max(0, total - checkedInCount) },
				total === 1 ? "This guest is already checked in." : `All ${total} guests on this booking are already checked in.`,
				true,
				ResCode.OK,
			)
		}

		const checkedInCount = (updated as any).checkedInCount as number
		// 3. Derived fields, each written conditionally so concurrent scans can't overwrite each other
		//    with a stale value: "full" only ever flips ON here, matched against the stored count, and
		//    `firstCheckInAt` is set once.
		await CheckIn.updateOne({ bookingId, checkedInCount: { $gte: total } }, { $set: { isFullyCheckedIn: true } })
		await CheckIn.updateOne({ bookingId, firstCheckInAt: null }, { $set: { firstCheckInAt: now } })

		return sendResponse(
			res,
			{ outcome: "checked_in" as ScanOutcome, ...base, checkedInCount, totalTickets: total, remainingTickets: Math.max(0, total - checkedInCount) },
			`Checked in guest ${checkedInCount} of ${total}.`,
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[check-in/scan] Error:", error?.message || error)
		return sendResponse(res, null, "Couldn't check in. Please scan again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
