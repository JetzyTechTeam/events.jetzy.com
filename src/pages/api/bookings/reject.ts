import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { BookingStatus } from "@/models/events/types"
import { sendApprovalRejected } from "@/lib/send-grid"
import { getStripeClient } from "@/lib/stripe-client"
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

	// Load the event (name/context for the email + ownership check)
	const event = await Events.findById(booking.eventId)
	if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)

	// Ownership: admin OR owner of the event
	if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
		return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
	}

	// ---- Paid approvals: release the card hold BEFORE writing the status. ----
	// A REJECTED booking still holding funds would be invisible to everyone: it drops out
	// of the pending list, nobody chases it, and the guest keeps a hold on their card.
	let releasedAmount: number | undefined
	if (booking.payment?.paymentIntentId && ["authorized", "capturing", "failed"].includes(booking.payment.status as string)) {
		const stripe = getStripeClient()
		const piId = booking.payment.paymentIntentId
		try {
			await stripe.paymentIntents.cancel(piId, { cancellation_reason: "abandoned" })
		} catch (err: any) {
			const code = err?.code || err?.raw?.code
			if (code === "payment_intent_unexpected_state") {
				const current = await stripe.paymentIntents.retrieve(piId)
				if (current.status === "canceled") {
					// Already released — nothing to do, fall through.
				} else if (current.status === "succeeded") {
					// The money is already taken. Silently rejecting here would strand a real
					// charge with no ticket, so refuse and make the host resolve it explicitly.
					booking.payment.status = "captured"
					booking.payment.capturedAt = booking.payment.capturedAt || new Date()
					await booking.save()
					return sendResponse(
						res,
						{ bookingRef, status: booking.status, payment: { status: "captured", amount: booking.payment.amount } },
						"This booking has already been charged. Approve it instead, or refund the payment in Stripe before rejecting.",
						false,
						ResCode.BAD_REQUEST,
					)
				} else {
					return sendResponse(res, null, `Payment is in an unexpected state (${current.status}).`, false, ResCode.INTERNAL_SERVER_ERROR)
				}
			} else {
				return sendResponse(res, null, `Could not release the card hold: ${err?.message || "cancel failed"}`, false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}
		releasedAmount = booking.payment.amount
		booking.payment.status = "canceled"
		booking.payment.canceledAt = new Date()
	}

	// Reject: mark inactive, no capacity change (pending never consumed any)
	booking.status = BookingStatus.REJECTED
	await booking.save()

	// Notify the attendee their request was not approved (non-fatal)
	try {
		const [firstName] = (booking.customerName || "").split(" ")
		await sendApprovalRejected({
			event,
			firstName: firstName || booking.customerName,
			lastName: "",
			email: booking.customerEmail,
			reason: "declined",
			...(releasedAmount !== undefined ? { payment: { amount: releasedAmount } } : {}),
		})
	} catch (emailError) {
		console.error("Failed to send approval-rejected email:", emailError)
	}

	return sendResponse(
		res,
		{
			bookingRef,
			status: booking.status,
			payment: booking.payment ? { status: booking.payment.status, amount: booking.payment.amount } : undefined,
			releasedAmount,
		},
		releasedAmount !== undefined
			? `Booking rejected. The $${releasedAmount.toFixed(2)} card hold has been released.`
			: "Booking rejected.",
		true,
		ResCode.OK,
	)
}
