import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { findUserRecord, getStripeClient, getUserStripeCustomerId, subscriptionMembershipKey } from "@/lib/premium"
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

		// The BILLING IDENTITY, not one product's record. One Stripe Customer holds every
		// subscription this person has, so the portal shows Jetzy Premium and Full Concierge
		// together with a cancel button each — reading `premiumSubscription.stripeCustomerId`
		// alone would have locked a Concierge-only member out of cancelling what they pay for.
		const customerId = getUserStripeCustomerId(record.doc)
		if (!customerId) {
			// No Stripe customer means they have never subscribed — there is nothing to manage,
			// and creating a customer here would just leave an empty portal.
			return sendResponse(res, null, "You don't have a membership to manage.", false, ResCode.BAD_REQUEST)
		}

		const returnTo = typeof req.body?.returnTo === "string" && req.body.returnTo.startsWith("/") ? req.body.returnTo : "/"
		const baseUrl = (process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com").replace(/\/$/, "")

		// Our own configuration, not the account default.
		//
		// The default has plan switching enabled, and one Stripe Customer holds every
		// membership a person has — so a member with Premium AND Full Concierge was offered
		// "Update subscription" on the Concierge one. Changing a Select plan from here bypasses
		// selectmember.jetzy.com's upgrade rules, proration preview and upgrade email, and since
		// apis-service's Stripe webhooks are disabled it never reaches Mongo either.
		//
		// Ours has `subscription_update` off entirely. Created by
		// `scripts/create-portal-config.ts`; the account default is deliberately untouched,
		// because SelectMember relies on it.
		//
		// Falls back to the default when the env var is absent so a missed deploy degrades to
		// today's behaviour rather than failing to open the portal at all.
		const configuration = process.env.STRIPE_PORTAL_CONFIG_ID
		const returnUrl = `${baseUrl}${returnTo}`

		// "Switch me to annual" — a second configuration, opened as a pinned update flow.
		//
		// Switching is off in the configuration above ON PURPOSE, so it can't be re-enabled
		// there: one Stripe Customer holds every membership, and an unscoped update button
		// appears on the Full Concierge row too. This flow is scoped twice over — the
		// configuration lists only Premium's product and prices, and `flow_data` pins the exact
		// subscription — and the subscription id comes from OUR record, never the request body.
		const wantsSwitch = req.body?.flow === "switch"
		const switchConfiguration = process.env.STRIPE_PORTAL_SWITCH_CONFIG_ID
		let flowExtras: Record<string, any> = {}

		if (wantsSwitch && switchConfiguration) {
			const subscriptionId = record.doc?.premiumSubscription?.stripeSubscriptionId
			if (subscriptionId) {
				const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId)
				// Confirm it really is Premium before pinning a plan-switching flow to it. The id
				// is ours, but a mis-stored Concierge id would otherwise open the one flow this
				// whole configuration split exists to keep away from Select's products.
				if (subscriptionMembershipKey(subscription) === "premium") {
					flowExtras = {
						configuration: switchConfiguration,
						flow_data: {
							type: "subscription_update",
							subscription_update: { subscription: subscriptionId },
							after_completion: { type: "redirect", redirect: { return_url: returnUrl } },
						},
					}
				}
			}
		}

		// Anything unresolved above — no switch config deployed, no subscription id, not Premium —
		// falls through to the ordinary portal rather than failing. Opening an update flow against
		// a configuration with `subscription_update: false` is a hard Stripe error, so a missed
		// env var would turn the button into a dead end instead of merely a plainer page.
		const portalSession = await getStripeClient().billingPortal.sessions.create({
			customer: customerId,
			return_url: returnUrl,
			...(configuration ? { configuration } : {}),
			...flowExtras,
		})

		return sendResponse(res, { url: portalSession.url }, "Billing portal session created.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[subscriptions/portal] Error:", error.message || error)
		return sendResponse(res, null, "Couldn't open the billing portal. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
