import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { findUserRecord, getStripeClient, PREMIUM_PRODUCT_ID } from "@/lib/premium"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)

	if (!session) {
		return sendResponse(res, null, "You need to be logged in to subscribe.", false, ResCode.UNAUTHORIZED)
	}

	try {
		const userId = (session.user as any)?._id || (session.user as any)?.id
		const email = (session.user as any)?.email
		const returnTo = typeof req.body?.returnTo === "string" && req.body.returnTo.startsWith("/") ? req.body.returnTo : "/"

		const record = await findUserRecord(userId)
		if (!record) {
			return sendResponse(res, null, "User not found.", false, ResCode.NOT_FOUND)
		}
		const { model, doc } = record

		if (doc.premiumSubscription?.active) {
			return sendResponse(res, null, "You already have an active Jetzy Premium subscription.", false, ResCode.BAD_REQUEST)
		}

		const stripe = getStripeClient()

		const product = await stripe.products.retrieve(PREMIUM_PRODUCT_ID, { expand: ["default_price"] })
		const price = product.default_price as Stripe.Price | null
		if (!price) {
			return sendResponse(res, null, "Premium plan has no active price configured.", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		let stripeCustomerId: string | undefined = doc.premiumSubscription?.stripeCustomerId
		if (!stripeCustomerId) {
			const customer = await stripe.customers.create({ email, metadata: { userId } })
			stripeCustomerId = customer.id
			await model.findByIdAndUpdate(doc._id, { $set: { "premiumSubscription.stripeCustomerId": stripeCustomerId } })
		}

		const baseUrl = (process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com").replace(/\/$/, "")
		const successUrl = `${baseUrl}${returnTo}?premium_session_id={CHECKOUT_SESSION_ID}`
		const cancelUrl = `${baseUrl}${returnTo}?premium_cancelled=1`

		const checkoutSession = await stripe.checkout.sessions.create({
			customer: stripeCustomerId,
			client_reference_id: userId,
			mode: "subscription",
			line_items: [{ price: price.id, quantity: 1 }],
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: { userId, purpose: "premium_subscription" },
		})

		return sendResponse(res, { url: checkoutSession.url }, "Subscription checkout created.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[subscriptions/checkout] Error:", error.message || error)
		return sendResponse(res, null, "Failed to start subscription checkout.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
