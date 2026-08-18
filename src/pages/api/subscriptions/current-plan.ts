import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { findUserRecord, getStripeClient, subscriptionMembershipKey } from "@/lib/premium"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

/**
 * What is this member actually paying, and when does it renew?
 *
 * `/api/subscriptions/me` answers "are they a member" from our own record. This answers "on
 * which plan", which our record deliberately does NOT store: the interval lives on the Stripe
 * price, and a copy of it here would go stale the moment someone switches monthly → annual in
 * the billing portal. Same reasoning selectmember.jetzy.com applies — the subscription's own
 * price is the truth.
 *
 * A SEPARATE ROUTE rather than a field on `/me`, because `/me` is polled by the navbar on every
 * page through `usePremiumStatus`. Hanging a Stripe round-trip off that would put a third-party
 * API call behind every page view; this one is fetched only when a plan card is on screen and
 * the viewer is a member.
 *
 * Best-effort by design. A Stripe outage returns what we do know — the stored renewal date —
 * with no interval, and the card then shows status and "Manage in Stripe" without offering a
 * switch. Refusing to render because a price lookup failed would be worse than saying less.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)

	if (!session) {
		return sendResponse(res, null, "You need to be logged in.", false, ResCode.UNAUTHORIZED)
	}

	try {
		const userId = (session.user as any)?._id || (session.user as any)?.id
		const record = await findUserRecord(userId)
		const stored = record?.doc?.premiumSubscription

		// Not a member, or a legacy record with no subscription id — the honest answer is that we
		// can't name a plan. The card falls back to "Manage in Stripe" alone.
		if (!stored?.active || !stored?.stripeSubscriptionId) {
			return sendResponse(
				res,
				{
					active: !!stored?.active,
					interval: null,
					unitAmount: null,
					currency: null,
					priceId: null,
					renewsAt: stored?.currentPeriodEnd || null,
					cancelAtPeriodEnd: !!stored?.cancelAtPeriodEnd,
					status: stored?.status || null,
					canSwitch: false,
				},
				"Subscription plan fetched.",
				true,
				ResCode.OK,
			)
		}

		let price: Stripe.Price | null = null
		let subscription: Stripe.Subscription | null = null
		try {
			subscription = await getStripeClient().subscriptions.retrieve(stored.stripeSubscriptionId)
			// Read the price off the subscription only when the product is one we recognise — an
			// unknown product must never be described to the member as their Jetzy Premium plan.
			if (subscriptionMembershipKey(subscription) === "premium") {
				price = (subscription.items.data[0]?.price as Stripe.Price) || null
			}
		} catch (stripeError: any) {
			console.error("[subscriptions/current-plan] Stripe lookup failed:", stripeError?.message || stripeError)
		}

		return sendResponse(
			res,
			{
				active: true,
				interval: price?.recurring?.interval || null,
				unitAmount: price?.unit_amount ?? null,
				currency: price?.currency || null,
				priceId: price?.id || null,
				// Stripe wins when we reached it; the stored date is the fallback, and is what a
				// pre-webhook record has anyway.
				renewsAt: subscription?.current_period_end
					? new Date(subscription.current_period_end * 1000)
					: stored.currentPeriodEnd || null,
				cancelAtPeriodEnd: subscription ? !!subscription.cancel_at_period_end : !!stored.cancelAtPeriodEnd,
				status: subscription?.status || stored.status || null,
				// Only a monthly member is offered a switch. A mid-term move off annual leaves an
				// unused credit on their Stripe customer that no refund policy here covers.
				canSwitch: price?.recurring?.interval === "month",
			},
			"Subscription plan fetched.",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[subscriptions/current-plan] Error:", error.message || error)
		return sendResponse(res, null, "Failed to fetch your plan.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
