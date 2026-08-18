import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { findUserRecord, getUserStripeCustomerId, hasEverHadMembership } from "@/lib/premium"
import { resolveTrialCode, trialEndsOn } from "@/lib/invite-trial"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"

/**
 * "Is this invite code good for me, on this plan?" — checked before the buyer commits.
 *
 * The same resolution the checkout route enforces, run early so a wrong code, a monthly-only
 * code against the annual plan, or an account that has had Premium before is reported while the
 * buyer can still do something about it. Finding out at Stripe's door is not a real answer: they
 * cannot edit the code from there.
 *
 * Session-required, because the first-timer rule is about THIS account's billing history. It
 * deliberately reveals nothing beyond yes/no for the caller's own account.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	if (!session) {
		return sendResponse(res, null, "You need to be logged in.", false, ResCode.UNAUTHORIZED)
	}

	try {
		const code = typeof req.body?.code === "string" ? req.body.code : ""
		const interval = req.body?.interval === "year" || req.body?.interval === "month" ? req.body.interval : undefined

		if (!code.trim()) {
			return sendResponse(res, { valid: false }, "Enter a code.", false, ResCode.BAD_REQUEST)
		}

		const resolved = resolveTrialCode(code, interval)
		if (!resolved.ok) {
			return sendResponse(res, { valid: false, reason: resolved.reason }, resolved.message, false, ResCode.BAD_REQUEST)
		}

		const userId = (session.user as any)?._id || (session.user as any)?.id
		const record = await findUserRecord(userId)
		const customerId = getUserStripeCustomerId(record?.doc)

		// No Stripe customer yet means no billing history at all — which is exactly who this
		// offer is for, so skip the lookup rather than creating a customer to ask about one.
		if (customerId && (await hasEverHadMembership(customerId, "premium"))) {
			return sendResponse(
				res,
				{ valid: false, reason: "existing-member" },
				"This code is for new members, and this account has had Jetzy Premium before.",
				false,
				ResCode.BAD_REQUEST,
			)
		}

		return sendResponse(
			res,
			{
				valid: true,
				months: resolved.offer.months,
				label: resolved.offer.label,
				chargesFrom: trialEndsOn(resolved.offer).toISOString(),
			},
			"Invite code applied.",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[subscriptions/invite-code] Error:", error.message || error)
		return sendResponse(res, null, "Couldn't check that code. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
