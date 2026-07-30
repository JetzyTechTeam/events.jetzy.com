import { ensureDbConnected } from "@/configs/database"
import { fulfillCheckoutSessionById } from "@/lib/checkout-fulfillment"
import { NextApiRequest, NextApiResponse } from "next"

/**
 * Called by /success after Stripe redirects the buyer back.
 *
 * The actual work lives in `fulfillCheckoutSessionById`, which the Stripe webhook also
 * calls — whichever arrives first creates the booking and the other is a no-op. Reloading
 * this endpoint is therefore safe, unlike the original implementation.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	await ensureDbConnected()

	try {
		const { session_id } = req.query
		if (!session_id || typeof session_id !== "string") {
			return res.status(400).json({ message: "Invalid session ID" })
		}

		const result = await fulfillCheckoutSessionById(session_id)
		if (!result.session) {
			return res.status(404).json({ message: "Session not found" })
		}

		return res.status(200).json({
			session: result.session,
			event: result.event,
			requiresApproval: result.requiresApproval,
			booking: result.booking
				? {
					bookingRef: result.booking.bookingRef,
					status: result.booking.status,
					total: result.booking.total,
					payment: result.booking.payment
						? {
							status: result.booking.payment.status,
							amount: result.booking.payment.amount,
							authExpiresAt: result.booking.payment.authExpiresAt,
						}
						: undefined,
				}
				: null,
		})
	} catch (error) {
		console.error("Error retrieving session:", error)
		return res.status(500).json({ message: "Internal server error" })
	}
}
