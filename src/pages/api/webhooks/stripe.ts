import { ensureDbConnected } from "@/configs/database"
import { getStripeClient, setPremiumStatusByStripeCustomerId, setUserPremiumStatus } from "@/lib/premium"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

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

				// Dispatch on what the session CONTAINS, not on its `mode`.
				//
				// A bundled ticket (see `IEventTicket.includesPremium`) is a `mode: "subscription"`
				// session that also carries the ticket as a one-time line item — so it needs BOTH
				// branches. These used to be `if (subscription) … else if (payment)`, which meant
				// such a session activated Premium and never created the booking: no Bookings row,
				// no capacity consumed, no QR, no ticket email, no referral increment, while the
				// buyer was charged in full.
				const sessionMetadata = (checkoutSession.metadata || {}) as Record<string, string | undefined>

				if (checkoutSession.subscription) {
					const userId = sessionMetadata.userId || checkoutSession.client_reference_id
					const subscription = await stripe.subscriptions.retrieve(
						typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : checkoutSession.subscription.id,
					)
					if (userId) {
						await setUserPremiumStatus(userId, {
							active: subscription.status === "active" || subscription.status === "trialing",
							stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
							stripeSubscriptionId: subscription.id,
							status: subscription.status,
							currentPeriodEnd: new Date(subscription.current_period_end * 1000),
							cancelAtPeriodEnd: subscription.cancel_at_period_end,
						})
					} else {
						// A subscription nobody owns can still bill. Loud, because the only fix is
						// manual. `client_reference_id` is single-valued and the ticket flow claims
						// it, which is exactly why bundled sessions carry `metadata.userId`.
						console.error("[webhooks/stripe] Subscription with no resolvable user:", checkoutSession.id)
					}
				}

				// Ticket purchase. The authoritative fulfilment path: without it a buyer who
				// never returns to /success would leave a live card hold — or a paid ticket —
				// with no booking row anywhere. Idempotent on bookingRef, so racing /success
				// is harmless.
				if (sessionMetadata.bookingRef) {
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

			case "customer.subscription.updated": {
				const subscription = event.data.object as Stripe.Subscription
				const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
				await setPremiumStatusByStripeCustomerId(customerId, {
					active: subscription.status === "active" || subscription.status === "trialing",
					stripeSubscriptionId: subscription.id,
					status: subscription.status,
					currentPeriodEnd: new Date(subscription.current_period_end * 1000),
					cancelAtPeriodEnd: subscription.cancel_at_period_end,
				})
				break
			}

			case "customer.subscription.deleted": {
				const subscription = event.data.object as Stripe.Subscription
				const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
				await setPremiumStatusByStripeCustomerId(customerId, {
					active: false,
					status: subscription.status,
					cancelAtPeriodEnd: false,
				})
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
