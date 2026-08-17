import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { findMembershipPriceForInterval, findUserRecord, getMembershipPrice, getStripeClient, resolveStripeCustomerForUser } from "@/lib/premium"
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
			return sendResponse(res, { alreadySubscribed: true }, "You already have an active Jetzy Premium subscription.", false, ResCode.BAD_REQUEST)
		}

		const stripe = getStripeClient()

		// Standalone Jetzy Premium signup — Full Concierge is sold only as part of a ticket,
		// so this flow is deliberately hardcoded to the one product.
		//
		// The buyer picks the INTERVAL, never a price id. Accepting `price` from the body would
		// let anyone subscribe at any price on the account — including one meant for a different
		// product. We take "month" | "year" and resolve the id ourselves.
		const requestedInterval = req.body?.interval
		const interval = requestedInterval === "year" || requestedInterval === "month" ? requestedInterval : undefined

		let price: Stripe.Price
		if (interval) {
			const match = await findMembershipPriceForInterval("premium", interval)
			if (!match) {
				// Never silently fall back to the default here: they chose annual, and charging
				// them monthly instead is a different deal from the one disclosed.
				console.error(`[subscriptions/checkout] Premium has no active ${interval} price`)
				return sendResponse(res, null, "That plan isn't available right now. Please try the other billing option.", false, ResCode.BAD_REQUEST)
			}
			price = match
		} else {
			// No interval sent — an older client. The product default, exactly as before.
			price = await getMembershipPrice("premium")
		}
		const stripeCustomerId = await resolveStripeCustomerForUser(userId, email)

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
			// Stamped so every webhook branch can identify the product without matching price
			// ids — the same marker `startMembershipSubscription` sets on the ones we create.
			subscription_data: { metadata: { membershipKey: "premium", userId } },
		})

		return sendResponse(res, { url: checkoutSession.url }, "Subscription checkout created.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[subscriptions/checkout] Error:", error.message || error)
		return sendResponse(res, null, "Failed to start subscription checkout.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
