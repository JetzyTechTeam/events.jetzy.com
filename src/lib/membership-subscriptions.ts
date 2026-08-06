/**
 * Turning a paid-for membership into a live Stripe subscription.
 *
 * ONE function, used by both money paths:
 *
 *   - `checkout-fulfillment.ts` — the buyer paid immediately;
 *   - `api/bookings/approve.ts` — the host approved and the hold was captured.
 *
 * They were separate flows until a ticket became able to sell two memberships. A Stripe
 * Checkout Session creates at most ONE subscription, so the immediate path could no longer
 * let Stripe do it and had to move to the same deferred shape the approval path already used.
 * Having one implementation is the point: the trial arithmetic, the duplicate guard, the
 * membership record write and the SelectMember mirror are all places where the two paths
 * drifting apart would mean someone billed twice or a membership silently missing.
 *
 * ---- Money is never rolled back here ----
 *
 * By the time this runs the card has been charged. If subscription creation fails, the caller
 * records `status: "failed"` against that product on the booking and carries on: the ticket is
 * real and paid for, and the gap stays visible and retryable. Throwing away a valid booking to
 * "undo" a membership would be strictly worse — there are no refunds in this system.
 *
 * SERVER ONLY.
 */

import dayjs from "dayjs"
import Stripe from "stripe"
import { MEMBERSHIPS, type MembershipKey } from "@/lib/memberships"
import {
	getStripeClient,
	hasActiveMembershipSubscription,
	setMembershipStatusByStripeCustomerId,
	setUserMembershipStatus,
} from "@/lib/premium"
import { syncSelectMembership } from "@/lib/select-member"

export type StartMembershipArgs = {
	key: MembershipKey
	/** The exact price quoted at checkout — never re-resolved, so a plan change can't move them. */
	priceId: string
	/** Billing interval the first period was sold at; drives the trial length. */
	interval?: string
	customerId: string
	/** Card saved at checkout via `setup_future_usage`. Without it renewals have nothing to bill. */
	paymentMethodId?: string
	/** The address that owns the membership — the checkout email, not the session. */
	email?: string
	/** Jetzy user id, when known, so the record is written even if the customer lookup misses. */
	subscriberId?: string
	metadata?: Record<string, string>
}

export type StartMembershipResult = {
	/** True when a NEW subscription was created; false when they already had one. */
	created: boolean
	subscriptionId?: string
	/** When the first REAL charge lands — the trial end. Shown on the receipt. */
	firstRenewalAt?: Date
}

/**
 * Create the subscription for a membership whose first period has already been paid.
 *
 * Throws on failure — the caller decides what that means for the rest of the booking, and
 * with two products a failure on one must not abort the other.
 */
export async function startMembershipSubscription(args: StartMembershipArgs): Promise<StartMembershipResult> {
	const { key, priceId, customerId, paymentMethodId, email, subscriberId, metadata } = args
	const interval = args.interval || "month"

	if (!customerId) throw new Error("no Stripe customer to attach the membership to")
	if (!priceId) throw new Error("no price recorded for the membership")

	const stripe = getStripeClient()

	// Belt and braces against a subscription started elsewhere between the charge and this
	// call — Stripe is the authority, our `active` copy lags the webhook.
	if (await hasActiveMembershipSubscription(customerId, key)) {
		console.warn(`[membership] ${key}: customer already subscribed, not creating a second one:`, customerId)
		return { created: false }
	}

	// The first period was just charged as a one-time line item, so the subscription must NOT
	// bill again now. The trial covers exactly that period; the first real invoice lands one
	// interval from today.
	const trialEnd = dayjs().add(1, interval as dayjs.ManipulateType).unix()

	const subscription = await stripe.subscriptions.create({
		customer: customerId,
		items: [{ price: priceId }],
		trial_end: trialEnd,
		...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
		// `membershipKey` is what lets every webhook branch know which product this is without
		// having to match product ids. It is the reason a Concierge cancellation can no longer
		// revoke someone's Premium.
		metadata: { ...(metadata || {}), membershipKey: key },
	})

	const firstRenewalAt = new Date(trialEnd * 1000)

	// Set membership state directly rather than waiting for the webhook, so the buyer is a
	// member the moment they finish checkout / the host clicks approve.
	const activation = {
		active: subscription.status === "active" || subscription.status === "trialing",
		stripeCustomerId: customerId,
		stripeSubscriptionId: subscription.id,
		status: subscription.status,
		currentPeriodEnd: new Date(subscription.current_period_end * 1000),
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
	}

	// By customer id first: the membership belongs to the checkout email, and that is the
	// account the Stripe customer was created for.
	await setMembershipStatusByStripeCustomerId(customerId, key, activation)
	if (subscriberId) await setUserMembershipStatus(String(subscriberId), key, activation).catch(() => {})

	// Mirror to selectmember.jetzy.com when the product is theirs. Best-effort by design —
	// `syncSelectMembership` swallows its own failures, because the card is already charged and
	// their site being down must not fail a booking. The `customer.subscription.*` webhooks
	// re-assert this on every later state change.
	if (MEMBERSHIPS[key].selectMemberPlan && email) {
		await syncSelectMembership({
			email,
			status: "active",
			externalSubscriptionId: subscription.id,
			startedAt: new Date(),
			expiresAt: new Date(subscription.current_period_end * 1000),
		})
	}

	return { created: true, subscriptionId: subscription.id, firstRenewalAt }
}
