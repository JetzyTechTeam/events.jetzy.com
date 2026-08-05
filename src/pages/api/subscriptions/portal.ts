import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { findUserRecord, getStripeClient } from "@/lib/premium"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"

/**
 * Stripe Billing Portal session — how a member cancels or updates their card.
 *
 * This exists because there was previously NO way to stop a Jetzy Premium subscription
 * anywhere in the product: `cancel_at_period_end` was only ever read back from Stripe, never
 * set. Selling the membership as part of a ticket (`IEventTicket.includesPremium`) makes that
 * untenable — a buyer can now acquire a recurring charge as a side effect of buying a ticket,
 * so a self-service exit is required, not a nice-to-have.
 *
 * The portal is hosted by Stripe, which means cancellation, payment-method updates and
 * invoice history all work without us reimplementing them — and a cancellation there arrives
 * back as `customer.subscription.deleted`, which the webhook already handles.
 *
 * NOTE: the portal must be configured once per Stripe environment (Settings → Billing →
 * Customer portal) or `billingPortal.sessions.create` fails.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)

	if (!session) {
		return sendResponse(res, null, "You need to be logged in to manage your membership.", false, ResCode.UNAUTHORIZED)
	}

	try {
		const userId = (session.user as any)?._id || (session.user as any)?.id
		const record = await findUserRecord(userId)
		if (!record) {
			return sendResponse(res, null, "User not found.", false, ResCode.NOT_FOUND)
		}

		const customerId: string | undefined = record.doc?.premiumSubscription?.stripeCustomerId
		if (!customerId) {
			// No Stripe customer means they have never subscribed — there is nothing to manage,
			// and creating a customer here would just leave an empty portal.
			return sendResponse(res, null, "You don't have a Jetzy Premium membership to manage.", false, ResCode.BAD_REQUEST)
		}

		const returnTo = typeof req.body?.returnTo === "string" && req.body.returnTo.startsWith("/") ? req.body.returnTo : "/"
		const baseUrl = (process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com").replace(/\/$/, "")

		const portalSession = await getStripeClient().billingPortal.sessions.create({
			customer: customerId,
			return_url: `${baseUrl}${returnTo}`,
		})

		return sendResponse(res, { url: portalSession.url }, "Billing portal session created.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[subscriptions/portal] Error:", error.message || error)
		return sendResponse(res, null, "Couldn't open the billing portal. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
