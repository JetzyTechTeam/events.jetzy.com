import { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { EventTracker } from "@/models/events/event-tracker"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { BookingStatus } from "@/models/events/types"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendBookingCancellation } from "@/lib/send-grid"

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

		// Ownership check:
		// - If session present → must match (admin OR userId OR email)
		// - If no session → fall back to bookingRef-as-token (email link flow for guest bookers)
		const session = await getServerSession(req, res, authOptions)
		if (session) {
			const sessionUserId = (session.user as any)?._id || (session.user as any)?.id
			const sessionEmail = session.user?.email
			const role = (session.user as any)?.role
			const isAdmin = role === "admin" || role === "super admin"

			const ownsByUserId = booking.bookerUserId && sessionUserId && booking.bookerUserId.toString() === sessionUserId.toString()
			const ownsByEmail = booking.customerEmail && sessionEmail && booking.customerEmail.toLowerCase() === sessionEmail.toLowerCase()

			if (!isAdmin && !ownsByUserId && !ownsByEmail) {
				return sendResponse(res, null, "Not authorized to cancel this booking", false, ResCode.FORBIDDEN)
			}
		}

		// Check if booking is already cancelled
		if (booking.status === BookingStatus.CANCELLED) {
			return sendResponse(res, null, "Booking is already cancelled", false, ResCode.BAD_REQUEST)
		}

		// Release any outstanding card hold before marking the booking cancelled. A guest
		// cancelling a pending paid request would otherwise keep a live authorization on
		// their card until it lapsed a week later.
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
		} else if (booking.payment?.status === "captured") {
			// No refund tooling exists in this codebase — flag it loudly rather than pretending
			// the money came back.
			console.warn(`[bookings/cancel] ${bookingRef} was already charged $${booking.payment.amount}; refund must be issued manually in Stripe.`)
		}

		// Update booking status to cancelled
		await Bookings.findByIdAndUpdate(booking._id, {
			status: BookingStatus.CANCELLED,
			...(releasedAmount !== undefined
				? { $set: { "payment.status": "canceled", "payment.canceledAt": new Date() } }
				: {}),
		})

		// Update event tracker to free up the tickets. Only bookings that actually consumed
		// capacity release it — a PENDING approval request never incremented the tracker, so
		// decrementing here would silently steal a seat from someone else.
		const consumedCapacity = booking.status === BookingStatus.CONFIRMED
		const eventTracker = consumedCapacity ? await EventTracker.findOne({ eventId: booking.eventId }) : null
		if (eventTracker) {
			const totalTicketsToFree = booking.tickets.reduce((acc, ticket) => acc + ticket.quantity, 0)
			eventTracker.bookedTickets = Math.max(0, eventTracker.bookedTickets - totalTicketsToFree)
			await eventTracker.save()
		}

		const updatedBooking = await Bookings.findById(booking._id)

		// Send cancellation confirmation email (best-effort; don't fail the API on email error)
		try {
			const event = await Events.findById(booking.eventId).lean<any>()
			if (event) {
				const nameParts = (booking.customerName || "").trim().split(/\s+/)
				const firstName = nameParts[0] || ""
				const lastName = nameParts.slice(1).join(" ") || ""

				const eventTicketMap = new Map<string, any>()
				;(event.tickets || []).forEach((t: any) => eventTicketMap.set(t._id?.toString(), t))

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
					totalAmount: booking.total || 0,
				})
			}
		} catch (emailErr) {
			console.error("Failed to send cancellation email:", emailErr)
		}

		return sendResponse(res, updatedBooking, "Booking cancelled successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error cancelling booking:", error)
		return sendResponse(res, null, `Failed to cancel booking: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
