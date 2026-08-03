import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { EventTracker } from "@/models/events/event-tracker"
import { CheckIn } from "@/models/checkIn"
import { BookingStatus } from "@/models/events/types"
import { getStripeClient } from "@/lib/premium"
import { sendApprovalRejected } from "@/lib/send-grid"
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
	const booking = await Bookings.findOne({ bookingRef }).lean()
	if (!booking) return sendResponse(res, null, "Booking not found.", false, ResCode.NOT_FOUND)

	if (!isAdmin) {
		const event = await Events.findById((booking as any).eventId, { ownerId: 1 }).lean()
		if (!event || (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
		}
	}

	// Deleting a booking that is still awaiting approval is a rejection: the guest asked
	// for a spot and is being turned down. Treat it exactly like /api/bookings/reject —
	// release any card hold and tell them — before the record disappears.
	const isPendingApproval = (booking as any).status === BookingStatus.PENDING
	let releasedAmount: number | undefined

	if (isPendingApproval) {
		const payment = (booking as any).payment
		// A live authorization must be cancelled first. Once the booking row is gone there
		// is nothing left to match the PaymentIntent to, so the hold would sit on the
		// guest's card until it expired with no way to find it.
		if (payment?.paymentIntentId && ["authorized", "capturing", "failed"].includes(payment.status)) {
			const stripe = getStripeClient()
			try {
				await stripe.paymentIntents.cancel(payment.paymentIntentId, { cancellation_reason: "abandoned" })
				releasedAmount = payment.amount
			} catch (err: any) {
				const code = err?.code || err?.raw?.code
				if (code === "payment_intent_unexpected_state") {
					const current = await stripe.paymentIntents.retrieve(payment.paymentIntentId)
					if (current.status === "succeeded") {
						// Already charged. Deleting would strand a real payment with no record.
						return sendResponse(
							res,
							null,
							"This booking has already been charged. Refund it in Stripe before deleting.",
							false,
							ResCode.BAD_REQUEST,
						)
					}
					// Already canceled — nothing to release, carry on.
					releasedAmount = payment.amount
				} else {
					return sendResponse(res, null, `Could not release the card hold: ${err?.message || "cancel failed"}`, false, ResCode.INTERNAL_SERVER_ERROR)
				}
			}
		}
	}

	// Only bookings that actually consumed capacity release it. A PENDING request never
	// incremented the tracker — the increment happens on approval — so decrementing here
	// would silently take a seat away from someone else.
	const consumedCapacity = (booking as any).status === BookingStatus.CONFIRMED
	const ticketCount = (booking as any).tickets.reduce((sum: number, t: any) => sum + (t.quantity || 0), 0)

	await Promise.all([
		Bookings.deleteOne({ bookingRef }),
		CheckIn.deleteOne({ bookingId: (booking as any)._id }),
		...(consumedCapacity
			? [EventTracker.findOneAndUpdate(
				{ eventId: (booking as any).eventId },
				{ $inc: { bookedTickets: -ticketCount } },
			)]
			: []),
	])

	// Same decline notice the Approvals tab sends. Non-fatal: the booking is already gone,
	// so a mail failure must not surface as a failed delete.
	if (isPendingApproval) {
		try {
			const eventDoc = await Events.findById((booking as any).eventId)
			if (eventDoc) {
				const [firstName, ...rest] = ((booking as any).customerName || "").split(" ")
				await sendApprovalRejected({
					event: eventDoc,
					firstName: firstName || (booking as any).customerName,
					lastName: rest.join(" "),
					email: (booking as any).customerEmail,
					reason: "declined",
					...(releasedAmount !== undefined ? { payment: { amount: releasedAmount } } : {}),
				})
			}
		} catch (emailError) {
			console.error("[bookings/delete] Failed to send decline email:", emailError)
		}
	}

	return sendResponse(
		res,
		{ rejectionEmailSent: isPendingApproval, releasedAmount },
		isPendingApproval
			? releasedAmount !== undefined
				? `Request declined. The $${releasedAmount.toFixed(2)} card hold was released and the guest has been notified.`
				: "Request declined and the guest has been notified."
			: "Booking deleted.",
		true,
		ResCode.OK,
	)
}
