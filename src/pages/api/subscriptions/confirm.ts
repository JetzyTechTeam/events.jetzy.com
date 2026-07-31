import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { getStripeClient, setUserPremiumStatus } from "@/lib/premium"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

// Fast path for immediate UI feedback right after Stripe redirects back — the webhook
// remains the source of truth for everything after this moment (renewals, cancellations).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)

	if (!session) {
		return sendResponse(res, null, "You need to be logged in.", false, ResCode.UNAUTHORIZED)
	}

	try {
		const { session_id } = req.query
		if (!session_id || typeof session_id !== "string") {
			return sendResponse(res, null, "Invalid session ID", false, ResCode.BAD_REQUEST)
		}

		const stripe = getStripeClient()
		const checkoutSession = await stripe.checkout.sessions.retrieve(session_id, { expand: ["subscription"] })

		if (checkoutSession.mode !== "subscription" || !checkoutSession.subscription) {
			return sendResponse(res, null, "This checkout session is not a subscription.", false, ResCode.BAD_REQUEST)
		}

		const subscription = checkoutSession.subscription as Stripe.Subscription
		const userId = checkoutSession.client_reference_id || (checkoutSession.metadata as any)?.userId

		if (!userId) {
			return sendResponse(res, null, "Could not resolve the subscribing user.", false, ResCode.BAD_REQUEST)
		}

		await setUserPremiumStatus(userId, {
			active: subscription.status === "active" || subscription.status === "trialing",
			stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
			stripeSubscriptionId: subscription.id,
			status: subscription.status,
			currentPeriodEnd: new Date(subscription.current_period_end * 1000),
			cancelAtPeriodEnd: subscription.cancel_at_period_end,
		})

		return sendResponse(res, { active: true }, "Subscription confirmed.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[subscriptions/confirm] Error:", error.message || error)
		return sendResponse(res, null, "Failed to confirm subscription.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
