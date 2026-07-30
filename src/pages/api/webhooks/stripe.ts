import { ensureDbConnected } from "@/configs/database"
import { getStripeClient } from "@/lib/stripe-client"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

/**
 * Stripe webhook — ticket payments only.
 *
 * Required for correctness, not just convenience: approval orders authorize the card
 * with `capture_method: "manual"`, so a buyer who closes the tab instead of returning to
 * /success would otherwise leave a live hold with no booking row anywhere — invisible to
 * the host and silently released a week later. This endpoint also carries the only
 * authoritative signal that a hold has expired.
 *
 * Subscription events are deliberately not handled here; Jetzy Premium does not exist on
 * this branch. Re-add the `mode === "subscription"` and `customer.subscription.*` cases
 * if that feature is ever merged in.
 *
 * Subscribe in the Stripe Dashboard, per environment:
 *   checkout.session.completed, payment_intent.canceled, payment_intent.payment_failed
 */

// Stripe needs the raw, unparsed request body to verify the webhook signature.
export const config = {
	api: {
		bodyParser: false,
	},
}

function readRawBody(req: NextApiRequest): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		req.on("data", (chunk) => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk))
		req.on("end", () => resolve(Buffer.concat(chunks)))
		req.on("error", reject)
	})
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	const signature = req.headers["stripe-signature"]
	const webhookSecret = process.env.NEXT_STRIPE_WEBHOOK_SECRET

	if (!signature || !webhookSecret) {
		console.error("[webhooks/stripe] Missing signature or NEXT_STRIPE_WEBHOOK_SECRET")
		return res.status(400).json({ message: "Webhook not configured" })
	}

	const stripe = getStripeClient()
	let event: Stripe.Event

	try {
		const rawBody = await readRawBody(req)
		event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
	} catch (error: any) {
		console.error("[webhooks/stripe] Signature verification failed:", error.message)
		return res.status(400).json({ message: `Webhook Error: ${error.message}` })
	}

	await ensureDbConnected()

	try {
		switch (event.type) {
			case "checkout.session.completed": {
				const checkoutSession = event.data.object as Stripe.Checkout.Session
				if (checkoutSession.mode === "payment") {
					// Authoritative fulfilment path. Idempotent, so racing /success is harmless.
					const { fulfillCheckoutSessionById } = await import("@/lib/checkout-fulfillment")
					await fulfillCheckoutSessionById(checkoutSession.id)
				}
				break
			}

			// A manual-capture authorization was released. `cancellation_reason: "automatic"`
			// means Stripe expired it — the host ran out of time and the guest can never be
			// charged for this request. Our own reject/cancel flows cancel with an explicit
			// reason and have already written their status, so they fall through untouched.
			case "payment_intent.canceled": {
				const pi = event.data.object as Stripe.PaymentIntent
				const { Bookings } = await import("@/models/events/bookings")
				const { BookingStatus } = await import("@/models/events/types")

				const booking = await Bookings.findOne({ "payment.paymentIntentId": pi.id })
				if (!booking) break
				if (booking.payment?.status === "captured") break // defensive: money already taken
				if (booking.status === BookingStatus.REJECTED || booking.status === BookingStatus.CANCELLED) break

				const expired = pi.cancellation_reason === "automatic"
				if (!booking.payment) booking.payment = {}
				booking.payment.status = expired ? "expired" : "canceled"
				booking.payment.canceledAt = new Date()
				if (expired) booking.status = BookingStatus.FAILED
				await booking.save()

				if (expired) {
					try {
						const { Events } = await import("@/models/events")
						const { sendApprovalRejected, sendAdminApprovalNotice } = await import("@/lib/send-grid")
						const bookingEvent = await Events.findById(booking.eventId)
						if (bookingEvent) {
							const [firstName, ...rest] = (booking.customerName || "").split(" ")
							const lastName = rest.join(" ")
							const amount = booking.payment?.amount || booking.total || 0
							await sendApprovalRejected({
								event: bookingEvent,
								firstName,
								lastName,
								email: booking.customerEmail,
								reason: "expired",
								payment: { amount },
							})
							// The host is not looking at a screen when this fires — tell them, or
							// they silently lose a paying guest.
							await sendAdminApprovalNotice({
								event: bookingEvent,
								firstName,
								lastName,
								email: booking.customerEmail,
								eventId: String(booking.eventId),
								kind: "expired",
								amountOnHold: amount,
							})
						}
					} catch (emailError) {
						console.error("[webhooks/stripe] Failed to send hold-expiry emails:", emailError)
					}
				}
				break
			}

			case "payment_intent.payment_failed": {
				const pi = event.data.object as Stripe.PaymentIntent
				const { Bookings } = await import("@/models/events/bookings")
				await Bookings.updateOne(
					{ "payment.paymentIntentId": pi.id, "payment.status": { $in: ["authorized", "capturing"] } },
					{ $set: { "payment.status": "failed", "payment.lastError": pi.last_payment_error?.message || "payment_failed" } },
				)
				break
			}

			default:
				break
		}

		return res.status(200).json({ received: true })
	} catch (error: any) {
		console.error("[webhooks/stripe] Handler error:", error.message || error)
		return res.status(500).json({ message: "Webhook handler failed" })
	}
}
