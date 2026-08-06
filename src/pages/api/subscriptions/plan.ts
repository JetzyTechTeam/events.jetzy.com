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

		return sendResponse(res, {
			membership: key,
			productId: product.id,
			// The registry label, not Stripe's product name: the two drift, and this is the name
			// shown next to a price the buyer is about to be charged.
			name: definition.label,
			unitAmount: price.unit_amount,
			currency: price.currency,
			interval: price.recurring?.interval || "month",
		}, `${definition.label} plan fetched.`, true, ResCode.OK)
	} catch (error: any) {
		console.error(`[subscriptions/plan] Error (${key}):`, error.message || error)
		return sendResponse(res, null, "Failed to fetch the membership plan.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
