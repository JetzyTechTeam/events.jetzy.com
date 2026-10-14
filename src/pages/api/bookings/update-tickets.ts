import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { isCancelledBooking, isPendingBooking } from "@/lib/booking-status"
import { bookingMoneyState } from "@/lib/booking-cancellation"
import { sessionIsAdmin, sessionUserId } from "@/lib/booking-identity"
import { bookingMemberships } from "@/lib/booking-memberships"
import { REQUEST_LOCK_MESSAGE, freeTicketEditRefusal, normalizeGuestName, ticketRows } from "@/lib/booking-request-edit"
import { verifyAvailability } from "@/lib/ticket-availability"
import { adjustBookedTickets, bookingConsumedCapacity } from "@/lib/event-tracker-sync"
import { Types } from "mongoose"
import zod from "zod"

/**
 * A host or admin corrects a CONFIRMED booking — the name on it, and how many tickets it is for.
 *
 * The rules are `bookingEditMode` in `src/lib/booking-request-edit.ts`, which the one Edit dialog
 * every screen opens reads too:
 *
 *  - **Name** — on any live booking, free or paid. A name carries no money. The check-in record,
 *    which copies the name when the guest first walks in, is kept in step.
 *  - **Quantity** — FREE bookings only. Jetzy issues no refunds, so lowering a quantity on a
 *    booking that was paid for would take a seat back and keep the money, and raising one would
 *    hand over a ticket nobody paid for. Up or down on a free booking; DOWN only when it sold a
 *    membership, because adding there would step past the per-person membership-ticket limit
 *    with nothing paid.
 *
 * **Not for pending requests.** Those go through `update-request.ts`, whose rules differ (a held
 * request's lower number is stored as a plan and applied at approval). This route used to accept a
 * free pending request too, which gave one request two editors with different rules.
 *
 * Only the quantities of tickets already on the booking may change. Adding a ticket type would
 * drag in pricing, approval resolution and membership bundling, none of which can be settled
 * without a payment step.
 */

const schema = zod
	.object({
		bookingRef: zod.string().nonempty(),
		// Bounded loosely here only as a paste backstop; the real rule is `normalizeGuestName`.
		customerName: zod.string().max(1000).optional(),
		tickets: zod
			.array(
				zod.object({
					ticketId: zod.string().nonempty(),
					// `0` removes the row. An empty booking is refused below — that is what Cancel is for.
					quantity: zod.number().int().min(0).max(1000),
				}),
			)
			.nonempty("Send at least one ticket row.")
			.optional(),
	})
	.refine((body) => body.customerName !== undefined || body.tickets !== undefined, { message: "Nothing to change." })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()

	// Session required, with no bearer-token path. Unlike `cancel.ts`, which a guest reaches
	// from an emailed link, this is a host tool and a guest has no business editing a booking.
	const session = await getServerSession(req, res, authOptions)
	const userId = sessionUserId(session)
	if (!userId) return sendResponse(res, null, "Not authenticated.", false, ResCode.UNAUTHORIZED)
	const isAdmin = sessionIsAdmin(session)

	const parsed = schema.safeParse(req.body)
	if (!parsed.success) {
		return sendResponse(res, null, parsed.error.errors[0]?.message || "Invalid input.", false, ResCode.BAD_REQUEST)
	}
	const { bookingRef, customerName: rawName, tickets: incoming } = parsed.data

	const booking = await Bookings.findOne({ bookingRef })
	if (!booking || (booking as any).isDeleted === true) {
		return sendResponse(res, null, "Booking not found.", false, ResCode.NOT_FOUND)
	}

	const event = await Events.findById(booking.eventId)
	if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)

	if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
		return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
	}

	if (isCancelledBooking(booking as any)) {
		return sendResponse(res, null, REQUEST_LOCK_MESSAGE.inactive, false, ResCode.BAD_REQUEST)
	}

	if (isPendingBooking(booking as any)) {
		return sendResponse(
			res,
			null,
			"This booking is still a request awaiting approval — edit it as a request (refresh and try again).",
			false,
			ResCode.BAD_REQUEST,
		)
	}

	const editedBy: "host" | "admin" = isAdmin ? "admin" : "host"
	const editedAt = new Date()
	const byUserId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined

	const set: Record<string, any> = {}
	const push: Record<string, any> = {}
	const said: string[] = []

	// ---- The name — any live booking, free or paid ----
	let newName: string | undefined
	if (rawName !== undefined) {
		const normalized = normalizeGuestName(rawName)
		if (!normalized.ok) return sendResponse(res, null, normalized.message, false, ResCode.BAD_REQUEST)
		if (normalized.name !== booking.customerName) {
			newName = normalized.name
			set.customerName = newName
			push.customerNameEditHistory = { at: editedAt, by: editedBy, byUserId, from: booking.customerName, to: newName }
			said.push("Name updated.")
		}
	}

	// ---- The tickets — free bookings only ----
	const before = ticketRows(booking.tickets as any)
	const oldTotal = before.reduce((sum, t) => sum + t.quantity, 0)
	let newTotal = oldTotal
	let delta = 0

	if (incoming) {
		// THE LINE. `hold`, `captured`, `released` and `unknown` are all refused — `unknown`
		// especially, because it means a priced booking with no payment record and we must never
		// treat one of those as free (238 such rows exist in production).
		const moneyState = bookingMoneyState(booking as any)
		if (moneyState !== "free") {
			return sendResponse(res, { moneyState }, REQUEST_LOCK_MESSAGE.paid_confirmed, false, ResCode.BAD_REQUEST)
		}

		// Only rows already on the booking, and every one of them; at least one ticket left; and no
		// row growing on a ticket that is now priced or now sells a membership.
		const refusal = freeTicketEditRefusal(before, incoming, event.tickets as any)
		if (refusal) return sendResponse(res, null, refusal, false, ResCode.BAD_REQUEST)

		const oldById = new Map(before.map((t) => [t.ticketId, t.quantity]))
		const changed = incoming.some((t) => oldById.get(String(t.ticketId)) !== t.quantity)

		if (changed) {
			newTotal = incoming.reduce((sum, t) => sum + t.quantity, 0)
			delta = newTotal - oldTotal

			// The booking itself sold a membership — read off the BOOKING, not just the event's
			// current ticket config, which the host may have changed since. Down only.
			if (delta > 0 && bookingMemberships(booking.payment as any).length > 0) {
				return sendResponse(
					res,
					null,
					"This booking came with a membership, so tickets can't be added to it — only fewer. A guest who wants more books again.",
					false,
					ResCode.BAD_REQUEST,
				)
			}

			// Capacity, but only when seats are being ADDED — freeing them can never fail. The whole
			// new selection is checked with THIS booking excluded from the count, so the host isn't
			// blocked by the seats the booking already holds.
			if (delta > 0) {
				const verdict = await verifyAvailability(
					event,
					incoming.map((t) => ({ id: String(t.ticketId), quantity: t.quantity })),
					String(booking._id),
				)
				if (!verdict.ok) {
					return sendResponse(res, null, verdict.reason, false, ResCode.BAD_REQUEST)
				}
			}

			// Don't let a host cut the booking below the people who have already walked in.
			try {
				const { CheckIn } = await import("@/models/checkIn")
				const checkIn: any = await CheckIn.findOne({ bookingId: booking._id })
				const checkedIn = Number(checkIn?.checkedInCount) || 0
				if (checkedIn > newTotal) {
					return sendResponse(
						res,
						null,
						`${checkedIn} ${checkedIn === 1 ? "guest has" : "guests have"} already checked in on this booking, so it can't be reduced to ${newTotal}.`,
						false,
						ResCode.BAD_REQUEST,
					)
				}
			} catch (checkInError: any) {
				// A check-in lookup failure must not block a correction the host needs to make.
				console.error("[bookings/update-tickets] Check-in lookup failed:", checkInError?.message || checkInError)
			}

			const after = incoming
				.filter((t) => t.quantity > 0)
				.map((t) => ({ ticketId: new Types.ObjectId(String(t.ticketId)), quantity: t.quantity }))

			// `total`, `subTotal`, `discountAmount` and `referralCode` are deliberately NOT recomputed.
			// No money moved. On a genuinely free booking recomputation is a no-op, and on an order a
			// referral code discounted to $0 it would rewrite the historical subtotal that
			// `discountAmount` was derived against — silently changing what the growth report says
			// that code achieved. A headcount correction is not a sale.
			set.tickets = after
			set.ticketsEditedAt = editedAt
			set.ticketsEditedBy = editedBy
			push.ticketsEditHistory = {
				at: editedAt,
				by: editedBy,
				byUserId,
				from: before.map((t) => ({ ticketId: new Types.ObjectId(t.ticketId), quantity: t.quantity })),
				to: after,
			}
			said.push(`Booking updated to ${newTotal} ${newTotal === 1 ? "ticket" : "tickets"}.`)
		}
	}

	if (!Object.keys(set).length) {
		return sendResponse(res, { bookingRef, ticketCount: oldTotal }, "No changes.", true, ResCode.OK)
	}

	// Written only while the booking is still live — a cancellation landing between the read
	// above and this write must not be overwritten by a headcount correction.
	const written = await Bookings.findOneAndUpdate(
		{ _id: booking._id, status: booking.status },
		{ $set: set, ...(Object.keys(push).length ? { $push: push } : {}) },
		{ new: true },
	).select("-payment.paymentIntentId -payment.checkoutSessionId")
	if (!written) {
		return sendResponse(res, null, "This booking changed while you were editing it — refresh and try again.", false, ResCode.BAD_REQUEST)
	}

	// Mirror the change onto the counter the mobile app reads — by the DELTA, and only when
	// this booking ever incremented it. `booking.updateEventTracker()` is additive-only and
	// would double-count here.
	if (delta !== 0 && bookingConsumedCapacity(booking as any)) {
		await adjustBookedTickets(booking.eventId, delta)
	}

	// Keep the check-in record in step. It copies the name and the ticket total when the guest
	// first walks in, and `isFullyCheckedIn` was computed against that total — so reducing a
	// booking after a partial check-in left it reading "Partial" when everyone was in. Best-effort:
	// the booking is the truth, and a check-in mirror that lags must not fail the edit.
	if (newName !== undefined || delta !== 0) {
		try {
			const { CheckIn } = await import("@/models/checkIn")
			await CheckIn.updateOne({ bookingId: booking._id }, [
				{
					$set: {
						// `$literal`: this is a pipeline update, and a name starting with "$" would
						// otherwise be read as a field path.
						...(newName !== undefined ? { customerName: { $literal: newName } } : {}),
						...(delta !== 0
							? { totalTickets: newTotal, isFullyCheckedIn: { $gte: [{ $ifNull: ["$checkedInCount", 0] }, newTotal] } }
							: {}),
					},
				},
			])
		} catch (checkInError: any) {
			console.error("[bookings/update-tickets] Could not update the check-in record:", checkInError?.message || checkInError)
		}
	}

	return sendResponse(
		res,
		{ bookingRef, customerName: written.customerName, tickets: written.tickets, ticketCount: newTotal, previousTicketCount: oldTotal },
		said.join(" "),
		true,
		ResCode.OK,
	)
}
