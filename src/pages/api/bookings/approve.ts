import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { EventTracker } from "@/models/events/event-tracker"
import { BookingStatus } from "@/models/events/types"
import { resolveEventLocation } from "@/lib/event-helpers"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { sendTicketConfirmation, sendAdminApprovalNotice } from "@/lib/send-grid"
import { getStripeClient } from "@/lib/stripe-client"
import Stripe from "stripe"
import zod from "zod"

const schema = zod.object({
	bookingRef: zod.string().nonempty(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	const userRole = (session?.user as any)?.role
	const userId = (session?.user as any)?._id?.toString()
	if (!userId) return sendResponse(res, null, "Not authenticated.", false, ResCode.UNAUTHORIZED)

	const isAdmin = userRole === "admin" || userRole === "super admin"

	const parsed = schema.safeParse(req.body)
	if (!parsed.success) return sendResponse(res, null, "Invalid input.", false, ResCode.BAD_REQUEST)

	const { bookingRef } = parsed.data
	const booking = await Bookings.findOne({ bookingRef })
	if (!booking) return sendResponse(res, null, "Booking not found.", false, ResCode.NOT_FOUND)

	if (booking.status !== BookingStatus.PENDING) {
		return sendResponse(res, null, "This booking is not awaiting approval.", false, ResCode.BAD_REQUEST)
	}

	const event = await Events.findById(booking.eventId)
	if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)

	// Ownership: admin OR owner of the event
	if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
		return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
	}

	// Capacity check (0 = unlimited) — approval consumes capacity.
	// Deliberately BEFORE any money moves: if we're going to refuse, refuse before
	// capturing. Capturing and then discovering the event is full would leave funds we
	// have no refund tooling to return.
	const requestedTickets = booking.tickets.reduce((sum, t) => sum + (t.quantity || 0), 0)
	const eventTracker = await EventTracker.findOne({ eventId: booking.eventId })
	if (eventTracker && eventTracker.eventCapacity > 0 && eventTracker.bookedTickets + requestedTickets > eventTracker.eventCapacity) {
		return sendResponse(res, null, "Cannot approve: event is at full capacity.", false, ResCode.BAD_REQUEST)
	}

	// ---- Paid approvals: capture the card hold placed at checkout. ----
	// Free bookings have no `payment` at all, so this whole block is skipped and their
	// behaviour is unchanged.
	let amountCharged: number | undefined
	const needsCapture = !!booking.payment?.paymentIntentId && ["authorized", "capturing", "failed"].includes(booking.payment?.status as string)

	if (needsCapture) {
		const piId = booking.payment!.paymentIntentId!

		// Atomic latch so a double-click or two admins acting at once can't double-capture.
		const latched = await Bookings.findOneAndUpdate(
			{ _id: booking._id, status: BookingStatus.PENDING, "payment.status": { $in: ["authorized", "failed"] } },
			{ $set: { "payment.status": "capturing" } },
			{ new: true },
		)
		if (!latched) {
			return sendResponse(res, null, "This request is already being processed.", false, ResCode.BAD_REQUEST)
		}
		booking.payment!.status = "capturing"

		// Capture BEFORE flipping to CONFIRMED. The two orderings are not symmetric:
		// confirm-then-fail leaves a confirmed booking, a consumed seat and an emailed QR
		// with no money — actively wrong. Capture-then-fail leaves money taken with the
		// booking still PENDING/"capturing", which a retry self-heals below via the
		// `succeeded` branch.
		const stripe = getStripeClient()
		let pi: Stripe.PaymentIntent
		try {
			pi = await stripe.paymentIntents.capture(piId)
		} catch (err: any) {
			const code = err?.code || err?.raw?.code
			if (code === "payment_intent_unexpected_state") {
				const current = await stripe.paymentIntents.retrieve(piId)
				if (current.status === "succeeded") {
					pi = current // already captured — idempotent, carry on
				} else if (current.status === "canceled") {
					booking.status = BookingStatus.FAILED
					booking.payment!.status = "expired"
					booking.payment!.canceledAt = new Date()
					booking.payment!.lastError = `PaymentIntent canceled (${current.cancellation_reason || "unknown"})`
					await booking.save()
					return sendResponse(
						res,
						{ bookingRef, status: booking.status, payment: { status: booking.payment!.status, amount: booking.payment!.amount } },
						"The card authorization has expired or was canceled, so this request can no longer be charged. Ask the guest to book again.",
						false,
						ResCode.BAD_REQUEST,
					)
				} else {
					booking.payment!.status = "authorized" // roll the latch back
					await booking.save()
					return sendResponse(res, null, `Payment is in an unexpected state (${current.status}).`, false, ResCode.INTERNAL_SERVER_ERROR)
				}
			} else {
				// Booking stays PENDING so it remains visible in Approvals and the host can retry.
				booking.payment!.status = "failed"
				booking.payment!.lastError = err?.message || String(err)
				await booking.save()
				return sendResponse(
					res,
					{ bookingRef, status: booking.status, payment: { status: "failed", amount: booking.payment!.amount, lastError: booking.payment!.lastError } },
					`Could not charge the card: ${err?.message || "capture failed"}`,
					false,
					ResCode.BAD_REQUEST,
				)
			}
		}

		amountCharged = (pi.amount_received ?? pi.amount ?? 0) / 100
		booking.payment!.status = "captured"
		booking.payment!.capturedAt = new Date()
		booking.payment!.amount = amountCharged
		booking.payment!.lastError = undefined
		booking.total = amountCharged
	}

	// Confirm the booking and consume capacity
	booking.status = BookingStatus.CONFIRMED
	await booking.save()
	await booking.updateEventTracker()

	// Referral usage was deliberately deferred from checkout so declined requests don't
	// burn a limited-use code. Now that the booking is real, count it.
	if (needsCapture && booking.referralCode) {
		try {
			const { ReferralCodes } = await import("@/models/events/referral-codes")
			const referralCode = await ReferralCodes.findOne({ code: booking.referralCode.trim().toUpperCase(), isDeleted: false })
			if (referralCode) {
				referralCode.usageCount += 1
				await referralCode.save()
			}
		} catch (referralError) {
			console.error("Failed to increment referral usage on approval:", referralError)
		}
	}

	await resolveEventLocation(event)

	// Build ticket details from the event's ticket subdocuments
	const [firstName, ...rest] = (booking.customerName || "").split(" ")
	const lastName = rest.join(" ")
	let ticketDetails = booking.tickets.map((bt) => {
		const et = (event as any).tickets?.find((t: any) => t._id?.toString() === bt.ticketId?.toString())
		return {
			name: et?.name || "Ticket",
			price: et?.price || 0,
			quantity: bt.quantity || 1,
			desc: et?.desc || "",
		}
	})

	// Free RSVPs can be booked without an explicit ticket selection — fall back to the
	// event's ticket(s) so the confirmation lists the free ticket instead of "Tickets (0)".
	if (ticketDetails.length === 0 && Array.isArray((event as any).tickets) && (event as any).tickets.length > 0) {
		ticketDetails = (event as any).tickets.map((t: any) => ({
			name: t.name || "General Admission",
			price: t.price || 0,
			quantity: 1,
			desc: t.desc || "",
		}))
	}

	// Send the celebratory "you've got a spot" confirmation (with QR + location) to the attendee
	try {
		let qrCodeImageUrl: string | undefined
		try {
			qrCodeImageUrl = await generateQRCodeForBooking(bookingRef)
		} catch (qrError) {
			console.error("Failed to generate QR code:", qrError)
		}
		await sendTicketConfirmation({
			event,
			firstName: firstName || booking.customerName,
			lastName,
			email: booking.customerEmail,
			phone: booking.customerPhone,
			tickets: ticketDetails,
			orderNumber: bookingRef,
			qrCodeImageUrl,
			approvalContext: true,
			amountCharged,
		})
	} catch (emailError) {
		// Never let a mail failure undo a successful capture — money first, mail second.
		console.error("Failed to send approval confirmation email:", emailError)
	}

	// Copy the admin inbox (contact@jetzyapp.com) that the request was approved
	try {
		await sendAdminApprovalNotice({
			event,
			firstName: firstName || booking.customerName,
			lastName,
			email: booking.customerEmail,
			tickets: ticketDetails,
			eventId: booking.eventId.toString(),
			kind: "approved",
			amountCharged,
		})
	} catch (adminError) {
		console.error("Failed to send admin approved notice:", adminError)
	}

	return sendResponse(
		res,
		{
			bookingRef,
			status: booking.status,
			payment: booking.payment
				? { status: booking.payment.status, amount: booking.payment.amount, capturedAt: booking.payment.capturedAt }
				: undefined,
			amountCharged,
		},
		amountCharged !== undefined
			? `Booking approved. $${amountCharged.toFixed(2)} charged successfully.`
			: "Booking approved and confirmed.",
		true,
		ResCode.OK,
	)
}
