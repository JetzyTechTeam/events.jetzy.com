/**
 * A ticket that moves a member onto a LONGER billing period — monthly Full Concierge → yearly.
 *
 * Whether someone HOLDS a membership is decided by membership, never by billing period
 * (`premium-eligibility.ts`), and that stays true: a monthly Concierge member is a Concierge
 * member. What this adds is a second question, asked only when the ticket sells the membership
 * yearly: is this buyer paying for it MONTHLY? Then the ticket is an UPGRADE (CEO, 2026-10-19):
 *
 *   - charged like a new sale — the yearly price, no free months;
 *   - the paid year starts when the month they already paid for ends, so nothing is wasted;
 *   - the monthly subscription is set to end at that same date (no refund, nothing lost);
 *   - whoever sold the monthly one — this site or selectmember.jetzy.com, same Stripe account.
 *
 * The answer comes from STRIPE, by email, across every customer with that address: our records
 * do not store a billing period (it would go stale after a portal switch), and a SelectMember
 * buyer may have no record here at all. A member visible only through SelectMember's status API
 * has no subscription we could stop, so they are never treated as upgradable.
 *
 * SERVER ONLY.
 */

import type Stripe from "stripe"
import { MEMBERSHIPS, MEMBERSHIP_KEYS, isMembershipProduct, type MembershipKey } from "@/lib/memberships"

/** `metadata.cancelledReason` on a monthly subscription a ticket upgraded to yearly. */
export const UPGRADED_CANCEL_REASON = "upgraded_to_yearly"

export type LiveMembershipSubscription = {
	key: MembershipKey
	subscriptionId: string
	customerId: string
	/** The billing period of the price on the subscription: "month" | "year". */
	interval: string
	status: Stripe.Subscription.Status
	cancelAtPeriodEnd: boolean
	/** `metadata.cancelledReason` — set when WE ended it (included with Concierge, upgraded). */
	cancelledReason?: string
	/** What the member has already paid for runs until here — the trial end while trialing. */
	paidThrough: Date
}

export type MembershipUpgrade = {
	key: MembershipKey
	/** The subscription the upgrade replaces. */
	subscriptionId: string
	customerId: string
	fromInterval: string
	toInterval: string
	/** ISO date. The new period starts here; the old subscription ends here. */
	paidThrough: string
}

/** When a subscription's already-paid time runs out. */
export const subscriptionPaidThrough = (subscription: Stripe.Subscription): Date =>
	new Date(
		(subscription.status === "trialing" && subscription.trial_end
			? subscription.trial_end
			: subscription.current_period_end) * 1000,
	)

/**
 * Every live (`active` / `trialing`) membership subscription on any Stripe customer with this
 * email. Null when Stripe couldn't be asked — distinct from "none".
 *
 * Customer SEARCH, not `customers.list({ email })`: list matches the address exactly, and
 * neither site lowercases what it stores. One person can have a customer on each site.
 */
export async function liveMembershipSubscriptionsByEmail(email: string): Promise<LiveMembershipSubscription[] | null> {
	const trimmed = typeof email === "string" ? email.trim() : ""
	if (!trimmed) return []
	try {
		const { getStripeClient } = await import("@/lib/premium")
		const stripe = getStripeClient()
		// Stripe search query syntax: backslash and double quote are escaped inside a quoted value.
		const quoted = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
		const customers = await stripe.customers.search({ query: `email:"${quoted}"`, limit: 10 })
		const found: LiveMembershipSubscription[] = []
		for (const customer of customers.data) {
			const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })
			for (const subscription of subscriptions.data) {
				if (subscription.status !== "active" && subscription.status !== "trialing") continue
				for (const item of subscription.items.data) {
					const product = item.price?.product
					const productId = typeof product === "string" ? product : product?.id
					const key = MEMBERSHIP_KEYS.find((k) => isMembershipProduct(k, productId))
					if (!key) continue
					found.push({
						key,
						subscriptionId: subscription.id,
						customerId: customer.id,
						interval: item.price?.recurring?.interval || "month",
						status: subscription.status,
						cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
						...((subscription.metadata as any)?.cancelledReason
							? { cancelledReason: String((subscription.metadata as any).cancelledReason) }
							: {}),
						paidThrough: subscriptionPaidThrough(subscription),
					})
					break
				}
			}
		}
		return found
	} catch (error: any) {
		console.error("[membership-upgrade] Stripe lookup by email failed:", error?.message || error)
		return null
	}
}

/**
 * The billing period a ticket ACTUALLY sells this membership at — resolved from the live prices,
 * exactly as `api/checkout` resolves the price it charges. A ticket set to "year" on a membership
 * with no yearly price is sold monthly, and must never be read as an upgrade.
 */
export async function resolvedMembershipInterval(key: MembershipKey, ticketInterval: string): Promise<string> {
	if (ticketInterval !== "year") return "month"
	const { findMembershipPriceForInterval } = await import("@/lib/premium")
	const price = await findMembershipPriceForInterval(key, "year")
	return price?.recurring?.interval === "year" ? "year" : "month"
}

/**
 * Is buying this membership at `targetInterval` an UPGRADE for this email?
 *
 * Only when ALL hold: the membership allows it (`upgradeOnTicket`); the target is yearly; the
 * buyer has a live MONTHLY subscription to it that is not already ending; and they have NO live
 * yearly one. Returns null otherwise — including when Stripe can't be asked, which leaves the
 * buyer on today's behaviour (ticket only, membership already held) rather than charging blind.
 */
export async function findMembershipUpgrade(
	email: string,
	key: MembershipKey,
	targetInterval: string,
	known?: LiveMembershipSubscription[] | null,
): Promise<MembershipUpgrade | null> {
	if (!MEMBERSHIPS[key]?.upgradeOnTicket || targetInterval !== "year") return null
	const live = known === undefined ? await liveMembershipSubscriptionsByEmail(email) : known
	if (!live) return null
	const ofKey = live.filter((sub) => sub.key === key)
	if (ofKey.some((sub) => sub.interval === "year")) return null
	// A monthly plan the member has CANCELLED (still running to the end of its paid month) counts
	// too (decided 2026-10-22): buying a yearly-Concierge ticket is a clear choice to keep Concierge,
	// and treating them as "already a member" charged the ticket alone and let Concierge end on the
	// date they had cancelled it for. A live, non-cancelling plan is preferred when both exist.
	const monthly =
		ofKey.find((sub) => sub.interval === "month" && !sub.cancelAtPeriodEnd) ||
		ofKey.find((sub) => sub.interval === "month" && sub.cancelAtPeriodEnd)
	if (!monthly) return null
	return {
		key,
		subscriptionId: monthly.subscriptionId,
		customerId: monthly.customerId,
		fromInterval: monthly.interval,
		toInterval: targetInterval,
		paidThrough: monthly.paidThrough.toISOString(),
	}
}

/**
 * Upgrades for a whole order: each membership the selection sells whose RESOLVED billing period
 * is yearly. `ticketInterval` is the interval of the first ticket in the selection that sells a
 * membership (`ticketMembershipInterval`), the same rule `api/checkout` prices by.
 */
export async function findOrderUpgrades(
	email: string,
	keys: MembershipKey[],
	ticketInterval: string,
): Promise<MembershipUpgrade[]> {
	const candidates = keys.filter((key) => MEMBERSHIPS[key]?.upgradeOnTicket)
	if (candidates.length === 0 || ticketInterval !== "year") return []
	const live = await liveMembershipSubscriptionsByEmail(email)
	const upgrades: MembershipUpgrade[] = []
	for (const key of candidates) {
		const target = await resolvedMembershipInterval(key, ticketInterval)
		const upgrade = await findMembershipUpgrade(email, key, target, live)
		if (upgrade) upgrades.push(upgrade)
	}
	return upgrades
}

/** `metadata.reactivatedBy` on a cancelled subscription a ticket purchase switched back on. */
export const REACTIVATED_METADATA_KEY = "reactivatedBy"

export type MembershipReactivation = {
	key: MembershipKey
	subscriptionId: string
	interval: string
	/** ISO — the date it WOULD have ended. */
	endsAt: string
}

/**
 * The member has CANCELLED this membership (still active until its paid period ends) and is buying
 * a ticket that sells it — and it is not an upgrade. Then the purchase SWITCHES THE CANCELLATION
 * BACK OFF (decided 2026-10-22): they keep the plan they have, it renews as before, and nothing
 * extra is charged today because the current period is already paid. Without this they paid for a
 * ticket that sells Concierge and still lost Concierge on the date they had cancelled it for.
 *
 * Only when EVERY live subscription to the membership is cancelling — a live, renewing one means
 * there is nothing to undo. Returns the one that runs longest.
 */
export async function findMembershipReactivation(
	email: string,
	key: MembershipKey,
	known?: LiveMembershipSubscription[] | null,
): Promise<MembershipReactivation | null> {
	const live = known === undefined ? await liveMembershipSubscriptionsByEmail(email) : known
	if (!live) return null
	const ofKey = live.filter((sub) => sub.key === key)
	if (ofKey.length === 0 || ofKey.some((sub) => !sub.cancelAtPeriodEnd)) return null
	// Never switch back on a subscription WE ended: a Premium retired because Concierge now includes
	// it (switching it on would bill Premium twice), or a monthly plan replaced by a yearly upgrade.
	// Only a cancellation the MEMBER made is undone.
	const ownCancellations = ofKey.filter(
		(sub) => sub.cancelledReason !== "included_with_concierge" && sub.cancelledReason !== UPGRADED_CANCEL_REASON,
	)
	if (ownCancellations.length === 0) return null
	const longest = [...ownCancellations].sort((a, b) => b.paidThrough.getTime() - a.paidThrough.getTime())[0]
	return { key, subscriptionId: longest.subscriptionId, interval: longest.interval, endsAt: longest.paidThrough.toISOString() }
}

/** Reactivations for an order: keys it sells that are not being charged (upgrades excluded). */
export async function findOrderReactivations(email: string, keys: MembershipKey[]): Promise<MembershipReactivation[]> {
	if (keys.length === 0) return []
	const live = await liveMembershipSubscriptionsByEmail(email)
	const found: MembershipReactivation[] = []
	for (const key of keys) {
		const reactivation = await findMembershipReactivation(email, key, live)
		if (reactivation) found.push(reactivation)
	}
	return found
}

/**
 * Switch the cancellation back off for every membership this order sells but did NOT charge (a
 * charged line is a new sale or an upgrade, handled where it is started). Called once the booking
 * is CONFIRMED — paid fulfilment, the free path, and approval — never for a pending request.
 * Best-effort: logs, never throws; a ticket that was paid for must never fail over this.
 */
export async function reactivateHeldMemberships(args: {
	email: string
	/** Memberships the order sells (`selectionMemberships` of the stored tickets). */
	keys: MembershipKey[]
	/** Memberships charged on this order — never reactivated here. */
	chargedKeys?: MembershipKey[]
	bookingRef?: string
}): Promise<MembershipReactivation[]> {
	try {
		const keys = args.keys.filter((key) => !(args.chargedKeys || []).includes(key))
		const reactivations = await findOrderReactivations(args.email, keys)
		if (reactivations.length === 0) return []
		const { getStripeClient } = await import("@/lib/premium")
		const stripe = getStripeClient()
		const done: MembershipReactivation[] = []
		for (const reactivation of reactivations) {
			try {
				const current = await stripe.subscriptions.retrieve(reactivation.subscriptionId)
				if (!current.cancel_at_period_end) continue
				await stripe.subscriptions.update(reactivation.subscriptionId, {
					cancel_at_period_end: false,
					metadata: { ...(current.metadata || {}), [REACTIVATED_METADATA_KEY]: args.bookingRef || "ticket" },
				})
				done.push(reactivation)
				console.log(`[membership-upgrade] ${reactivation.key} cancellation undone by ticket purchase:`, reactivation.subscriptionId, args.bookingRef)
			} catch (error: any) {
				console.error(`[membership-upgrade] Couldn't undo the ${reactivation.key} cancellation:`, reactivation.subscriptionId, error?.message || error)
			}
		}
		return done
	} catch (error: any) {
		console.error("[membership-upgrade] reactivateHeldMemberships failed:", error?.message || error)
		return []
	}
}
