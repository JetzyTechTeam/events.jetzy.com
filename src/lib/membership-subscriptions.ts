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
import { MEMBERSHIPS, isMembershipProduct, type MembershipKey } from "@/lib/memberships"
import { UPGRADED_CANCEL_REASON, subscriptionPaidThrough } from "@/lib/membership-upgrade"
import {
	getStripeClient,
	hasActiveMembershipSubscription,
	retireIncludedSubscriptions,
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
	/** Buyer's display name, for the sale record only — never used for billing or matching. */
	name?: string
	/** Jetzy user id, when known, so the record is written even if the customer lookup misses. */
	subscriberId?: string
	/**
	 * Free months granted by a referral code, instead of the usual "one interval already paid".
	 *
	 * The first period was NOT charged in this case — the membership line was $0 — so the trial
	 * is the offer itself rather than an accounting device for a period already bought.
	 */
	trialMonths?: number
	/**
	 * How this membership was sold, for reporting. Defaults to what a bundled ticket implies —
	 * `gift` when months were given away, `ticket` otherwise — which is what every existing
	 * caller means. Signup grants pass `signup` because no ticket was involved at all.
	 */
	source?: "ticket" | "gift" | "signup" | "application" | "upgrade"
	/** The invite code redeemed, when one was. Recorded, never used to price anything. */
	inviteCode?: string
	metadata?: Record<string, string>
	/**
	 * This purchase UPGRADES an existing subscription to the same membership on a longer billing
	 * period (monthly Concierge → yearly; `src/lib/membership-upgrade.ts`). The new subscription
	 * starts paying when the old one's already-paid time ends, and the old one is then set to end
	 * at that same date. It may sit on another Stripe customer (one sold by selectmember.jetzy.com).
	 */
	replaces?: { subscriptionId: string }
}

export type StartMembershipResult = {
	/** True when a NEW subscription was created; false when they already had one. */
	created: boolean
	subscriptionId?: string
	/** When the first REAL charge lands — the trial end. Shown on the receipt. */
	firstRenewalAt?: Date
	/** On an upgrade: the billing period replaced, and when the new paid period began. */
	replacedInterval?: string
	startsAt?: Date
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

	// ---- An upgrade: read the subscription being replaced, fresh from Stripe ----
	//
	// Re-read now, not taken from checkout: on an approval order days can pass, and the monthly
	// plan may have renewed (paid time moved on) or been cancelled meanwhile.
	let replaced: Stripe.Subscription | null = null
	if (args.replaces?.subscriptionId) {
		try {
			replaced = await stripe.subscriptions.retrieve(args.replaces.subscriptionId)
		} catch (error: any) {
			// Fail LOUDLY: falling through to the ordinary guard would see the still-live monthly
			// plan, return "already subscribed", and leave a member charged the yearly price with no
			// yearly subscription and nothing on the booking to say so. Throwing marks the row
			// `failed` with this message instead, where it is visible and retryable.
			if (error?.code !== "resource_missing") {
				throw new Error(`couldn't read the monthly subscription being upgraded (${args.replaces.subscriptionId}): ${error?.message || error}`)
			}
		}
		// Ended or deleted meanwhile → nothing to replace; the year simply starts now.
		if (replaced && !(replaced.status === "active" || replaced.status === "trialing")) replaced = null
	}

	// Belt and braces against a subscription started elsewhere between the charge and this
	// call — Stripe is the authority, our `active` copy lags the webhook. On an upgrade the
	// subscription being replaced doesn't count; any OTHER live one still does (they may have gone
	// yearly in the meantime).
	if (replaced) {
		const others = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })
		const anotherLive = others.data.some(
			(sub) =>
				sub.id !== replaced!.id &&
				(sub.status === "active" || sub.status === "trialing") &&
				sub.items.data.some((item) => {
					const product = item.price?.product
					return isMembershipProduct(key, typeof product === "string" ? product : product?.id)
				}),
		)
		if (anotherLive) {
			console.warn(`[membership] ${key}: upgrade target already has another live subscription, not creating one:`, customerId)
			return { created: false }
		}
	} else if (await hasActiveMembershipSubscription(customerId, key)) {
		console.warn(`[membership] ${key}: customer already subscribed, not creating a second one:`, customerId)
		return { created: false }
	}

	// Two reasons a subscription starts in a trial here, and they mean different things:
	//
	//   - normal bundled ticket — the first period was just charged as a one-time line item, so
	//     the subscription must NOT bill again now. The trial covers exactly that period.
	//   - a referral code granting free months — nothing was charged for the membership at all,
	//     and the trial IS the offer.
	//
	// Either way `trial_end` is the date the first real invoice lands, which is what the receipt
	// and the billing portal show.
	//
	// An upgrade pays for the period that starts when the OLD subscription's paid time ends — the
	// month they already paid for is never wasted (CEO, 2026-10-19).
	const upgradeStartsAt = replaced ? subscriptionPaidThrough(replaced) : null
	const trialEnd = upgradeStartsAt
		? dayjs(upgradeStartsAt).add(1, interval as dayjs.ManipulateType).unix()
		: args.trialMonths && args.trialMonths > 0
			? dayjs().add(args.trialMonths, "month").unix()
			: dayjs().add(1, interval as dayjs.ManipulateType).unix()

	const subscription = await stripe.subscriptions.create({
		customer: customerId,
		items: [{ price: priceId }],
		trial_end: trialEnd,
		...(paymentMethodId ? { default_payment_method: paymentMethodId } : {}),
		// No card — a free RSVP collects none, so there is nothing to charge when the trial ends.
		// Without this Stripe raises an invoice nobody can pay and the subscription sits
		// `past_due` indefinitely; cancelling is the honest end to a gift.
		...(paymentMethodId
			? {}
			: { trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } } }),
		// `membershipKey` is what lets every webhook branch know which product this is without
		// having to match product ids. It is the reason a Concierge cancellation can no longer
		// revoke someone's Premium.
		metadata: {
			...(metadata || {}),
			membershipKey: key,
			...(replaced ? { upgradedFrom: replaced.id } : {}),
		},
	})

	// The old subscription stops only once the new one EXISTS — never the other way round, or a
	// failure here would leave a paying member with nothing. `replacedBy` is how the webhook knows
	// its ending changes nothing for the member, even when it sits on another Stripe customer.
	// Best-effort: the yearly subscription is never rolled back over this.
	if (replaced) {
		try {
			await stripe.subscriptions.update(replaced.id, {
				cancel_at_period_end: true,
				metadata: { ...(replaced.metadata || {}), cancelledReason: UPGRADED_CANCEL_REASON, replacedBy: subscription.id },
			})
		} catch (error: any) {
			console.error(`[membership] ${key}: yearly created but the old subscription could not be stopped:`, replaced.id, error?.message || error)
		}
	}

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

	// Concierge includes Premium: a separate Premium subscription on this customer stops at the
	// end of its paid period rather than billing alongside. Best-effort, never throws.
	if (activation.active) await retireIncludedSubscriptions(customerId, key)

	// Mirror to selectmember.jetzy.com when the product is theirs. Best-effort by design —
	// `syncSelectMembership` swallows its own failures, because the card is already charged and
	// their site being down must not fail a booking. The `customer.subscription.*` webhooks
	// re-assert this on every later state change.
	if (MEMBERSHIPS[key].selectMemberPlan && email) {
		await syncSelectMembership({
			email,
			key,
			status: "active",
			externalSubscriptionId: subscription.id,
			interval: subscription.items?.data?.[0]?.price?.recurring?.interval || interval,
			startedAt: new Date(),
			expiresAt: new Date(subscription.current_period_end * 1000),
		})
	}

	// The sale, for reporting. Best-effort and deliberately last: the subscription exists and
	// the buyer is a member whether or not this row is written.
	//
	// `source` distinguishes a membership somebody PAID for with their ticket from one that was
	// given away — the same subscription object in Stripe, and a question the CEO asks about
	// every campaign.
	//
	// The fallback is `"ticket"`, NOT "gift on any trial". Free months are now an ordinary part
	// of a ticket sale — a host can put them on the ticket, so every buyer gets them with no
	// code — and reporting all of those as giveaways would say the whole product was handed out.
	// A caller that really is gifting says so; the campaign behind a trial is separately
	// attributable through `referralCode` / `inviteCode` below.
	try {
		const { recordMembershipPurchase } = await import("@/models/events/membership-purchases")
		const soldPrice = subscription.items.data[0]?.price
		await recordMembershipPurchase({
			key,
			source: args.source || (replaced ? "upgrade" : "ticket"),
			email,
			name: args.name,
			userId: subscriberId ? String(subscriberId) : undefined,
			stripeCustomerId: customerId,
			stripeSubscriptionId: subscription.id,
			priceId,
			interval: soldPrice?.recurring?.interval || interval,
			...(soldPrice?.unit_amount != null ? { amount: soldPrice.unit_amount / 100 } : {}),
			...(soldPrice?.currency ? { currency: soldPrice.currency } : {}),
			...(metadata?.referralCode ? { referralCode: metadata.referralCode } : {}),
			...(args.inviteCode ? { inviteCode: args.inviteCode } : {}),
			...(args.trialMonths ? { trialMonths: args.trialMonths } : {}),
			trialEndsAt: firstRenewalAt,
			...(metadata?.eventId ? { eventId: metadata.eventId } : {}),
			...(metadata?.bookingRef ? { bookingRef: metadata.bookingRef } : {}),
		})
	} catch (recordError: any) {
		console.error("[membership] Could not record the membership sale:", recordError?.message || recordError)
	}

	return {
		created: true,
		subscriptionId: subscription.id,
		firstRenewalAt,
		...(replaced && upgradeStartsAt
			? { replacedInterval: replaced.items.data[0]?.price?.recurring?.interval || "month", startsAt: upgradeStartsAt }
			: {}),
	}
}
