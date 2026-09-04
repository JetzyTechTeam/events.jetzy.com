import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { findMembershipRecord, getUserStripeCustomerId, hasEverHadMembership } from "@/lib/premium"
import { defaultTrialOffer, resolveTrialCode, trialEndsOn } from "@/lib/invite-trial"
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

		// No code typed. That is not a mistake to report — it is the ordinary case, and there is
		// a standing offer behind it. Answered through the SAME response shape as a code so the
		// three buying surfaces read one thing, with `code: ""` saying where it came from.
		//
		// The first-timer check below still applies. Its refusal is silent here (`quiet: true`):
		// the caller never typed anything, so painting an error against an untouched field would
		// read as the page being broken rather than as an offer not applying.
		if (!code.trim()) {
			const standing = defaultTrialOffer(interval)
			if (!standing) {
				return sendResponse(res, { valid: false, quiet: true }, "No offer applies.", false, ResCode.BAD_REQUEST)
			}
			const userId = (session.user as any)?._id || (session.user as any)?.id
			const record = await findMembershipRecord(userId, (session.user as any)?.email)
			const customerId = getUserStripeCustomerId(record?.doc)
			if (customerId && (await hasEverHadMembership(customerId, "premium"))) {
				return sendResponse(
					res,
					{ valid: false, quiet: true, reason: "existing-member" },
					"This offer is for new members.",
					false,
					ResCode.BAD_REQUEST,
				)
			}
			return sendResponse(
				res,
				{
					valid: true,
					months: standing.months,
					label: standing.label,
					code: "",
					chargesFrom: trialEndsOn(standing).toISOString(),
				},
				"Offer applied.",
				true,
				ResCode.OK,
			)
		}

		// Two kinds of code reach this endpoint, and the event is what tells them apart.
		//
		// With an `event`, it is a host's referral code shared as a Premium link — resolved from
		// Mongo, with the share-only rules in `resolveReferralTrial`. Without one, it is an invite
		// code from the hardcoded table, exactly as before. Same response either way, so the page
		// reads one shape.
		const eventId = typeof req.body?.event === "string" ? req.body.event.trim() : ""

		let months: number
		let label: string
		let resolvedCode: string

		if (eventId) {
			const { resolveReferralTrial } = await import("@/lib/referral-trial")
			const referral = await resolveReferralTrial(eventId, code)
			if (!referral.ok) {
				return sendResponse(res, { valid: false, reason: "referral" }, referral.message, false, ResCode.BAD_REQUEST)
			}
			months = referral.months
			resolvedCode = referral.code
			label = `${months} month${months === 1 ? "" : "s"} free`
		} else {
			const resolved = resolveTrialCode(code, interval)
			if (!resolved.ok) {
				return sendResponse(res, { valid: false, reason: resolved.reason }, resolved.message, false, ResCode.BAD_REQUEST)
			}
			months = resolved.offer.months
			resolvedCode = resolved.code
			label = resolved.offer.label
		}

		const userId = (session.user as any)?._id || (session.user as any)?.id
		// The first-timer rule is about the PERSON's billing history, so resolve the account
		// that holds it rather than whichever document this session is bound to.
		const record = await findMembershipRecord(userId, (session.user as any)?.email)
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
				months,
				label,
				code: resolvedCode,
				// Same calendar-month maths for both kinds of code, so the date on the card is the
				// date the subscription actually converts.
				chargesFrom: trialEndsOn({ months, intervals: [], label }).toISOString(),
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
