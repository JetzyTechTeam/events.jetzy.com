import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { findUserRecord, getUserStripeCustomerId } from "@/lib/premium"
import { MEMBERSHIPS, MEMBERSHIP_KEYS } from "@/lib/memberships"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"

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
		const userId = (session.user as any)?._id || (session.user as any)?.id
		const record = await findUserRecord(userId)

		const premiumSubscription = record?.doc?.premiumSubscription || { active: false }

		// Every membership, keyed by product, plus whether there is anything to manage at all.
		// `hasBillingAccount` is what the Manage-membership page gates on: a Concierge-only
		// member has no `premiumSubscription.active` and would otherwise be told they have
		// nothing to cancel while their card is being charged monthly.
		const memberships = MEMBERSHIP_KEYS.reduce((acc, key) => {
			acc[key] = record?.doc?.[MEMBERSHIPS[key].userField] || { active: false }
			return acc
		}, {} as Record<string, any>)

		return sendResponse(
			res,
			{
				premiumSubscription,
				memberships,
				hasBillingAccount: !!getUserStripeCustomerId(record?.doc),
			},
			"Subscription status fetched.",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[subscriptions/me] Error:", error.message || error)
		return sendResponse(res, null, "Failed to fetch subscription status.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
