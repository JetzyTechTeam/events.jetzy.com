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
				if (checkoutSession.mode === "subscription" && checkoutSession.subscription) {
					const userId = checkoutSession.client_reference_id || (checkoutSession.metadata as any)?.userId
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
					}
				}
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
