import { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { EventTracker } from "@/models/events/event-tracker"
import { Events } from "@/models/events"
import { CheckIn } from "@/models/checkIn"
import { ensureDbConnected } from "@/configs/database"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { BookingStatus } from "@/models/events/types"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendBookingCancellation, sendHostCancellationNotice } from "@/lib/send-grid"
import { sessionIsAdmin, sessionOwnsBooking, sessionUserId } from "@/lib/booking-identity"
import { bookingMoneyAmount, bookingMoneyState, canGuestCancel } from "@/lib/booking-cancellation"
import { isCancelledBooking } from "@/lib/booking-status"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()

	try {
		const { bookingRef } = req.body

		if (!bookingRef) {
			return sendResponse(res, null, "Booking reference is required", false, ResCode.BAD_REQUEST)
		}

		// Find the booking by reference
		const booking = await Bookings.findOne({ bookingRef })

		if (!booking) {
			return sendResponse(res, null, "Booking not found", false, ResCode.NOT_FOUND)
		}

		const event = await Events.findById(booking.eventId).lean<any>()

		// Ownership:
		// - session present  → admin, the event's host, or the person who booked
		// - no session       → bookingRef acts as a bearer token (cancel link in the
		//                      confirmation email, used by guests who never made an account)
		const session = await getServerSession(req, res, authOptions)
		const isAdmin = sessionIsAdmin(session)
		const isHost = !!session && !!event?.ownerId && event.ownerId.toString() === sessionUserId(session)
		const isBooker = sessionOwnsBooking(session, booking as any)

		if (session && !isAdmin && !isHost && !isBooker) {
			return sendResponse(res, null, "Not authorized to cancel this booking", false, ResCode.FORBIDDEN)
		}

		// Hosts and admins may cancel at any time — they need to be able to clean up after
		// an event too. Everyone else (including the emailed bearer-token path) is held to
		// the event-start cutoff, otherwise a guest can walk out mid-event and hand their
		// seat back.
		const managesEvent = isAdmin || isHost
		if (!managesEvent) {
			const eligibility = canGuestCancel(booking as any, event)
			if (!eligibility.allowed) {
				return sendResponse(res, null, eligibility.reason || "This booking can no longer be cancelled.", false, ResCode.FORBIDDEN)
			}
		} else if (isCancelledBooking(booking as any)) {
			return sendResponse(res, null, "This booking is no longer active.", false, ResCode.BAD_REQUEST)
		}

		// Money state is read BEFORE anything is mutated — the emails below describe where
		// the money was at cancellation time, and releasing the hold overwrites it.
		const moneyState = bookingMoneyState(booking as any)
		const moneyAmount = bookingMoneyAmount(booking as any)

		// Release any outstanding card hold. A guest cancelling a pending paid request would
		// otherwise keep a live authorization on their card until it lapsed a week later.
		//
		// NOTE: this is NOT a refund and must never become one. Jetzy issues no refunds —
		// captured payments stay captured (see lib/booking-cancellation.ts).
		let releasedAmount: number | undefined
		if (booking.payment?.paymentIntentId && ["authorized", "capturing", "failed"].includes(booking.payment.status as string)) {
			try {
				const { getStripeClient } = await import("@/lib/premium")
				await getStripeClient().paymentIntents.cancel(booking.payment.paymentIntentId, { cancellation_reason: "abandoned" })
				releasedAmount = booking.payment.amount
			} catch (stripeError: any) {
				// Already canceled at Stripe is fine; anything else is logged and does not block
				// the cancellation, but must be visible for reconciliation.
				console.error("[bookings/cancel] Could not release card hold:", stripeError?.message || stripeError)
			}
		}

		const cancelledBy: "guest" | "host" | "admin" = isAdmin && !isBooker ? "admin" : isHost && !isBooker ? "host" : "guest"
		const cancelledAt = new Date()

		await Bookings.findByIdAndUpdate(booking._id, {
			$set: {
				status: BookingStatus.CANCELLED,
				cancelledAt,
				cancelledBy,
				// A captured payment keeps `payment.status: "captured"` — the money really was
				// taken and no refund is issued, so claiming otherwise would misreport revenue.
				...(releasedAmount !== undefined ? { "payment.status": "canceled", "payment.canceledAt": cancelledAt } : {}),
			},
		})

		// Free the seat and drop any check-in record. Only bookings that actually consumed
		// capacity release it — a PENDING approval request never incremented the tracker, so
		// decrementing here would silently steal a seat from someone else.
		const consumedCapacity = booking.status === BookingStatus.CONFIRMED
		const totalTicketsToFree = booking.tickets.reduce((acc, ticket) => acc + ticket.quantity, 0)

		await Promise.all([
			CheckIn.deleteOne({ bookingId: booking._id }),
			...(consumedCapacity
				? [
					EventTracker.findOneAndUpdate(
						{ eventId: booking.eventId },
						[{ $set: { bookedTickets: { $max: [0, { $subtract: ["$bookedTickets", totalTicketsToFree] }] } } }],
					),
				]
				: []),
		])

		const updatedBooking = await Bookings.findById(booking._id).select("-payment.paymentIntentId -payment.checkoutSessionId")

		// Emails are best-effort — the cancellation already happened and must not be
		// reported as failed because SendGrid was down.
		try {
			if (event) {
				const nameParts = (booking.customerName || "").trim().split(/\s+/)
				const firstName = nameParts[0] || ""
				const lastName = nameParts.slice(1).join(" ") || ""

				const eventTicketMap = new Map<string, any>()
				for (const t of event.tickets || []) eventTicketMap.set(t._id?.toString(), t)

				const ticketItems = booking.tickets.map((bt: any) => {
					const meta = eventTicketMap.get(bt.ticketId?.toString())
					return {
						name: meta?.name || "Ticket",
						price: Number(meta?.price) || 0,
						quantity: bt.quantity,
						desc: meta?.desc || "",
					}
				})

				await sendBookingCancellation({
					event,
					firstName,
					lastName,
					email: booking.customerEmail,
					phone: booking.customerPhone,
					tickets: ticketItems,
					orderNumber: booking.bookingRef,
					totalAmount: moneyAmount,
					moneyState,
					cancelledBy,
				})
			}
		} catch (emailErr) {
			console.error("[bookings/cancel] Failed to send guest cancellation email:", emailErr)
		}

		// Notify the host + the Jetzy inbox so a freed seat isn't a silent event.
		try {
			if (event) {
				let organizerEmail: string | undefined
				if (event.ownerId) {
					const { findUserRecord } = await import("@/lib/premium")
					const owner = await findUserRecord(event.ownerId.toString())
					organizerEmail = owner?.doc?.email
				}

				await sendHostCancellationNotice({
					event,
					eventId: String(event._id),
					guestName: booking.customerName,
					guestEmail: booking.customerEmail,
					guestPhone: booking.customerPhone,
					ticketCount: totalTicketsToFree,
					orderNumber: booking.bookingRef,
					totalAmount: moneyAmount,
					moneyState,
					cancelledBy,
					organizerEmail,
				})
			}
		} catch (noticeErr) {
			console.error("[bookings/cancel] Failed to send host cancellation notice:", noticeErr)
		}

		return sendResponse(
			res,
			{ booking: updatedBooking, moneyState, releasedAmount, cancelledBy },
			"Booking cancelled successfully",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("Error cancelling booking:", error)
		return sendResponse(res, null, `Failed to cancel booking: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
