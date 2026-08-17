import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { getStripeClient } from "@/lib/premium"
import { MEMBERSHIPS, isMembershipKey } from "@/lib/memberships"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

/**
 * GET /api/subscriptions/plan?membership=premium|concierge
 *
 * Public price disclosure for a membership. Unauthenticated on purpose: a guest looking at a
 * bundled ticket has to see the recurring amount and interval BEFORE buying — card-network
 * rules require it, and the buyer may not realise a ticket carries a subscription at all.
 *
 * Defaults to Premium so callers written before Full Concierge existed keep working.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	const requested = Array.isArray(req.query.membership) ? req.query.membership[0] : req.query.membership
	const key = isMembershipKey(requested) ? requested : "premium"
	const definition = MEMBERSHIPS[key]

	try {
		const stripe = getStripeClient()
		const product = await stripe.products.retrieve(definition.productId, { expand: ["default_price"] })
		const price = product.default_price as Stripe.Price | null

		if (!price) {
			return sendResponse(res, null, `${definition.label} has no active price configured.`, false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// Every interval this membership is sold at. Jetzy Premium has monthly AND annual on the
		// same product — a second PRICE, never a second product, because membership detection
		// resolves by product id and a separate product would be invisible to every eligibility
		// check on both this site and selectmember.jetzy.com.
		//
		// One-time prices are filtered out: a membership is a subscription by definition, and a
		// stray one-time price on the product would otherwise be offered as a plan.
		const allPrices = await stripe.prices.list({ product: definition.productId, active: true, limit: 100 })

		// EXACTLY ONE PRICE PER INTERVAL, and the product's default always wins its own.
		//
		// The Premium product carries a legacy $10/month price alongside the current $20 one,
		// still active in both test and live. Listing every active price would put both in the
		// selector — two "Monthly" options, one of them half price, and nothing stopping a buyer
		// choosing it. Deduping on interval is what makes this endpoint safe to drive a picker
		// from; archiving the old price would also fix it, but the endpoint shouldn't depend on
		// nobody ever leaving a stale price behind.
		//
		// `interval_count` is part of the key: "every 3 months" is a different offering from
		// monthly, not a duplicate of it.
		const byInterval = new Map<string, Stripe.Price>()
		for (const candidate of allPrices.data) {
			if (!candidate.recurring || candidate.unit_amount == null) continue
			const slot = `${candidate.recurring.interval}:${candidate.recurring.interval_count ?? 1}`
			const existing = byInterval.get(slot)
			// Stripe lists newest first, so the first seen is the most recent — the right guess
			// for "the current price" when several share an interval and none is the default.
			if (!existing || candidate.id === price.id) byInterval.set(slot, candidate)
		}

		const prices = [...byInterval.values()]
			.map((p) => ({
				id: p.id,
				unitAmount: p.unit_amount,
				currency: p.currency,
				interval: p.recurring?.interval || "month",
				intervalCount: p.recurring?.interval_count ?? 1,
				isDefault: p.id === price.id,
			}))
			// Cheapest first, so monthly precedes annual without hardcoding either.
			.sort((a, b) => (a.unitAmount ?? 0) - (b.unitAmount ?? 0))

		return sendResponse(res, {
			membership: key,
			productId: product.id,
			// The registry label, not Stripe's product name: the two drift, and this is the name
			// shown next to a price the buyer is about to be charged.
			name: definition.label,
			// The default price stays the top-level answer. `useMembershipPlans` feeds the
			// recurring disclosure on every bundled ticket off these fields, so their shape and
			// meaning must not move — `prices` is purely additive.
			unitAmount: price.unit_amount,
			currency: price.currency,
			interval: price.recurring?.interval || "month",
			prices,
		}, `${definition.label} plan fetched.`, true, ResCode.OK)
	} catch (error: any) {
		console.error(`[subscriptions/plan] Error (${key}):`, error.message || error)
		return sendResponse(res, null, "Failed to fetch the membership plan.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
