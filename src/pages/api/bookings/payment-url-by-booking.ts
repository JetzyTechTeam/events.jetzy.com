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
		const { bookingRef } = req.query

		if (!bookingRef || typeof bookingRef !== "string") {
			return sendResponse(res, null, "Booking reference is required", false, ResCode.BAD_REQUEST)
		}

		console.log("[bookings/payment-url-by-booking] Looking for booking with ref:", bookingRef)

		// Find booking by reference
		const booking = await Bookings.findOne({ bookingRef, isDeleted: false }).lean()

		if (!booking) {
			return sendResponse(res, null, "Booking not found", false, ResCode.NOT_FOUND)
		}

		// If booking has stripeSessionId, use it
		if (booking.stripeSessionId) {
			console.log("[bookings/payment-url-by-booking] Found stripeSessionId:", booking.stripeSessionId)
			const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId)
			
			if (session.url) {
				return sendResponse(
					res,
					{ paymentUrl: session.url },
					"Payment URL retrieved successfully",
					true,
					ResCode.OK
				)
			}
		}

		// Try to find Stripe session by client_reference_id (booking ref without JZ- prefix)
		const clientRefId = bookingRef.replace(/^JZ-/, "")
		console.log("[bookings/payment-url-by-booking] Searching Stripe sessions with client_reference_id:", clientRefId)

		// Search for sessions with this client_reference_id
		// Search in the last 100 sessions (Stripe allows up to 100 per page)
		let matchingSession = null
		let hasMore = true
		let startingAfter: string | undefined = undefined

		// Search through multiple pages if needed
		while (hasMore && !matchingSession) {
			const sessions: Stripe.Response<Stripe.ApiList<Stripe.Checkout.Session>> = await stripe.checkout.sessions.list({
				limit: 100,
				starting_after: startingAfter,
			})

			// Look for unpaid sessions with matching client_reference_id
			// Check for sessions that are not paid and not "no_payment_required"
			matchingSession = sessions.data.find(
				(session) => 
					session.client_reference_id === clientRefId && 
					session.payment_status !== "paid" && 
					session.payment_status !== "no_payment_required"
			)

			hasMore = sessions.has_more
			if (sessions.data.length > 0) {
				startingAfter = sessions.data[sessions.data.length - 1].id
			}

			// Limit search to first 500 sessions to avoid timeout
			if (sessions.data.length < 100) {
				hasMore = false
			}
		}

		if (matchingSession && matchingSession.url) {
			console.log("[bookings/payment-url-by-booking] Found matching Stripe session:", matchingSession.id)
			// Update booking with stripeSessionId for future reference
			await Bookings.updateOne(
				{ bookingRef },
				{ $set: { stripeSessionId: matchingSession.id } }
			)
			return sendResponse(
				res,
				{ paymentUrl: matchingSession.url },
				"Payment URL retrieved successfully",
				true,
				ResCode.OK
			)
		}

		return sendResponse(
			res,
			null,
			"Payment URL not available. The payment link may have expired or the booking was created through a different method.",
			false,
			ResCode.NOT_FOUND
		)
	} catch (error: any) {
		console.error("[bookings/payment-url-by-booking] Error retrieving payment URL:", error)
		return sendResponse(
			res,
			null,
			error.message || "Failed to retrieve payment URL",
			false,
			ResCode.INTERNAL_SERVER_ERROR
		)
	}
}

