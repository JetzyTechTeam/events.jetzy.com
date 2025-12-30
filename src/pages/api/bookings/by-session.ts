import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import Stripe from "stripe"

const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { session_id } = req.query

		if (!session_id || typeof session_id !== "string") {
			return sendResponse(res, null, "Session ID is required", false, ResCode.BAD_REQUEST)
		}

		console.log("[bookings/by-session] Looking for booking with session_id:", session_id)

		// First, try to find booking by stripeSessionId (for waiting list bookings and regular checkouts)
		let booking = await Bookings.findOne({
			stripeSessionId: session_id,
			isDeleted: false,
		}).lean()

		if (booking) {
			console.log("[bookings/by-session] Found booking by stripeSessionId:", booking.bookingRef)
		}

		// If not found, try to find by booking reference from Stripe session
		if (!booking) {
			try {
				// Get Stripe session to find client_reference_id
				const session = await stripe.checkout.sessions.retrieve(session_id)
				console.log("[bookings/by-session] Stripe session retrieved:", {
					id: session.id,
					client_reference_id: session.client_reference_id,
					payment_status: session.payment_status,
					metadata: session.metadata
				})

				// Try to find by bookingId in metadata (for waiting list approvals)
				if (session.metadata?.bookingId) {
					console.log("[bookings/by-session] Looking for booking by metadata.bookingId:", session.metadata.bookingId)
					booking = await Bookings.findOne({
						_id: session.metadata.bookingId,
						isDeleted: false,
					}).lean()

					if (booking) {
						console.log("[bookings/by-session] Found booking by metadata.bookingId:", booking.bookingRef)
						// Update booking with stripeSessionId if not already set
						if (!booking.stripeSessionId) {
							await Bookings.updateOne(
								{ _id: booking._id },
								{ $set: { stripeSessionId: session_id } }
							)
							console.log("[bookings/by-session] Updated booking with stripeSessionId")
						}
					}
				}

				// If still not found, try by client_reference_id
				if (!booking && session.client_reference_id) {
					// client_reference_id is just the ID part, booking reference is JZ-{id}
					const bookingRef = `JZ-${session.client_reference_id}`
					console.log("[bookings/by-session] Looking for booking with bookingRef:", bookingRef)

					// Find booking by reference
					booking = await Bookings.findOne({
						bookingRef,
						isDeleted: false,
					}).lean()

					if (booking) {
						console.log("[bookings/by-session] Found booking by bookingRef:", booking.bookingRef)
						// Update booking with stripeSessionId if not already set
						if (!booking.stripeSessionId) {
							await Bookings.updateOne(
								{ bookingRef },
								{ $set: { stripeSessionId: session_id } }
							)
							console.log("[bookings/by-session] Updated booking with stripeSessionId")
						}
					}
				}
			} catch (stripeError: any) {
				console.error("[bookings/by-session] Error retrieving Stripe session:", {
					message: stripeError.message,
					code: stripeError.code,
					type: stripeError.type
				})
				// Continue to return 404 if booking not found
			}
		}

		if (!booking) {
			console.log("[bookings/by-session] Booking not found for session_id:", session_id)
			console.log("[bookings/by-session] Searched by: stripeSessionId, metadata.bookingId, client_reference_id")
			return sendResponse(res, null, "Booking not found. It may still be processing. Please check back in a moment.", false, ResCode.NOT_FOUND)
		}

		return sendResponse(
			res,
			{
				bookingRef: booking.bookingRef,
				qrCodeToken: booking.qrCodeToken || null,
			},
			"Booking found",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error fetching booking by session:", error)
		return sendResponse(res, null, error.message || "Failed to fetch booking", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}


