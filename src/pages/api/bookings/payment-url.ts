import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { sessionId } = req.query

		if (!sessionId || typeof sessionId !== "string") {
			return sendResponse(res, null, "Session ID is required", false, ResCode.BAD_REQUEST)
		}

		console.log("[bookings/payment-url] Retrieving payment URL for session:", sessionId)

		const session = await stripe.checkout.sessions.retrieve(sessionId)

		console.log("[bookings/payment-url] Session details:", {
			id: session.id,
			payment_status: session.payment_status,
			status: session.status,
			expires_at: session.expires_at,
			hasUrl: !!session.url,
			url: session.url
		})

		// Check if session has expired
		if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000)) {
			console.log("[bookings/payment-url] Session has expired")
			return sendResponse(res, null, "Payment link has expired. Please create a new payment session.", false, ResCode.NOT_FOUND)
		}

		// Check if session is already completed
		if (session.payment_status === 'paid' || session.status === 'complete') {
			console.log("[bookings/payment-url] Session already completed")
			return sendResponse(res, null, "Payment has already been completed for this session.", false, ResCode.BAD_REQUEST)
		}

		if (!session.url) {
			console.log("[bookings/payment-url] Session URL is missing")
			return sendResponse(res, null, "Payment URL not available for this session", false, ResCode.NOT_FOUND)
		}

		console.log("[bookings/payment-url] Retrieved payment URL:", session.url)

		return sendResponse(
			res,
			{ paymentUrl: session.url },
			"Payment URL retrieved successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[bookings/payment-url] Error retrieving payment URL:", error)
		return sendResponse(
			res,
			null,
			error.message || "Failed to retrieve payment URL",
			false,
			ResCode.INTERNAL_SERVER_ERROR
		)
	}
}

