import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { getStripeClient, PREMIUM_PRODUCT_ID } from "@/lib/premium"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const stripe = getStripeClient()
		const product = await stripe.products.retrieve(PREMIUM_PRODUCT_ID, { expand: ["default_price"] })
		const price = product.default_price as Stripe.Price | null

		if (!price) {
			return sendResponse(res, null, "Premium plan has no active price configured.", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		return sendResponse(res, {
			productId: product.id,
			name: product.name,
			unitAmount: price.unit_amount,
			currency: price.currency,
			interval: price.recurring?.interval || "month",
		}, "Premium plan fetched.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[subscriptions/plan] Error:", error.message || error)
		return sendResponse(res, null, "Failed to fetch premium plan.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
