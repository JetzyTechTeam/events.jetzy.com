import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import {
	findMembershipPriceForInterval,
	findMembershipRecord,
	getMembershipPrice,
	getStripeClient,
	hasEverHadMembership,
	resolveStripeCustomerForUser,
} from "@/lib/premium"
import { defaultTrialOffer, resolveTrialCode, trialEndsOn } from "@/lib/invite-trial"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)

	if (!session) {
		return sendResponse(res, null, "You need to be logged in to subscribe.", false, ResCode.UNAUTHORIZED)
	}

	try {
		const userId = (session.user as any)?._id || (session.user as any)?.id
		const email = (session.user as any)?.email
		const returnTo = typeof req.body?.returnTo === "string" && req.body.returnTo.startsWith("/") ? req.body.returnTo : "/"

		// Identity, not document id — otherwise an existing member who signed in through the
		// other collection is sold a SECOND subscription on the same Stripe customer.
		const record = await findMembershipRecord(userId, email)
		if (!record) {
			return sendResponse(res, null, "User not found.", false, ResCode.NOT_FOUND)
		}
		const { model, doc } = record

		if (doc.premiumSubscription?.active) {
			return sendResponse(res, { alreadySubscribed: true }, "You already have an active Jetzy Premium subscription.", false, ResCode.BAD_REQUEST)
		}

		const stripe = getStripeClient()

		// Standalone Jetzy Premium signup — Full Concierge is sold only as part of a ticket,
		// so this flow is deliberately hardcoded to the one product.
		//
		// The buyer picks the INTERVAL, never a price id. Accepting `price` from the body would
		// let anyone subscribe at any price on the account — including one meant for a different
		// product. We take "month" | "year" and resolve the id ourselves.
		const requestedInterval = req.body?.interval
		const interval = requestedInterval === "year" || requestedInterval === "month" ? requestedInterval : undefined

		let price: Stripe.Price
		if (interval) {
			const match = await findMembershipPriceForInterval("premium", interval)
			if (!match) {
				// Never silently fall back to the default here: they chose annual, and charging
				// them monthly instead is a different deal from the one disclosed.
				console.error(`[subscriptions/checkout] Premium has no active ${interval} price`)
				return sendResponse(res, null, "That plan isn't available right now. Please try the other billing option.", false, ResCode.BAD_REQUEST)
			}
			price = match
		} else {
			// No interval sent — an older client. The product default, exactly as before.
			price = await getMembershipPrice("premium")
		}
		const stripeCustomerId = await resolveStripeCustomerForUser(userId, email)

		// ---- Invite code → free trial ----
		//
		// Resolved against the shared table in `lib/invite-trial.ts`, never trusted from the
		// body beyond the string itself, and checked against the interval actually being bought:
		// a monthly-only code must not silently grant two free months of a $200 plan.
		//
		// FIRST-TIMERS ONLY, on history rather than current state. Someone who subscribed,
		// cancelled and came back is not new, and Stripe will not stop them redeeming again.
		// Refused loudly here rather than at the door of Stripe, so the buyer can clear the field
		// and continue instead of meeting a failure they can't act on.
		const rawInviteCode = typeof req.body?.inviteCode === "string" ? req.body.inviteCode : ""
		// A host's referral code, shared as a Premium link. The event is what distinguishes it from
		// an invite code out of the hardcoded table — see `resolveReferralTrial` for the two extra
		// rules that apply when a membership is given away with no ticket behind it.
		const referralEventId = typeof req.body?.event === "string" ? req.body.event.trim() : ""
		let trialEnd: number | undefined
		/** The NORMALISED code, set only once it has been accepted. Reported on, never displayed. */
		let trialCodeApplied: string | undefined
		/** Set instead of `trialCodeApplied` when the months came from a host's referral code. */
		let referralCodeApplied: string | undefined
		/** Months from the STANDING offer — no code was typed, so there is none to report. */
		let defaultTrialMonths = 0

		if (rawInviteCode.trim() && referralEventId) {
			const { resolveReferralTrial } = await import("@/lib/referral-trial")
			const referral = await resolveReferralTrial(referralEventId, rawInviteCode)
			if (!referral.ok) {
				return sendResponse(res, { inviteCode: true }, referral.message, false, ResCode.BAD_REQUEST)
			}
			if (await hasEverHadMembership(stripeCustomerId, "premium")) {
				return sendResponse(
					res,
					{ inviteCode: true },
					"This code is for new members, and this account has had Jetzy Premium before. Remove the code to continue.",
					false,
					ResCode.BAD_REQUEST,
				)
			}
			trialEnd = Math.floor(trialEndsOn({ months: referral.months, intervals: [], label: "" }).getTime() / 1000)
			referralCodeApplied = referral.code
			console.log(
				`[subscriptions/checkout] referral code ${referral.code} (event ${referral.eventId}) applied for ${userId} until ${new Date(trialEnd * 1000).toISOString()}`,
			)
		} else if (rawInviteCode.trim()) {
			const resolved = resolveTrialCode(rawInviteCode, price.recurring?.interval)
			if (!resolved.ok) {
				return sendResponse(res, { inviteCode: true }, resolved.message, false, ResCode.BAD_REQUEST)
			}
			if (await hasEverHadMembership(stripeCustomerId, "premium")) {
				return sendResponse(
					res,
					{ inviteCode: true },
					"This code is for new members, and this account has had Jetzy Premium before. Remove the code to continue.",
					false,
					ResCode.BAD_REQUEST,
				)
			}
			// Calendar months, not 60 days — "2 months free" bought on the 31st should end on a
			// date a person recognises.
			trialEnd = Math.floor(trialEndsOn(resolved.offer).getTime() / 1000)
			trialCodeApplied = resolved.code
			console.log(`[subscriptions/checkout] trial code ${resolved.code} applied for ${userId} until ${new Date(trialEnd * 1000).toISOString()}`)
		} else {
			// ---- No code typed: the STANDING offer ----
			//
			// Free months are the ordinary terms of starting now, not a campaign, so nobody has
			// to hold a code to get them. The first-timer rule is the same as above — someone who
			// subscribed, cancelled and came back is not new — but it is applied SILENTLY here.
			// They never asked for an offer, so a refusal is not something to put in front of
			// them; they simply pay the ordinary price the plan card already showed them.
			const standing = defaultTrialOffer(price.recurring?.interval)
			if (standing && !(await hasEverHadMembership(stripeCustomerId, "premium"))) {
				trialEnd = Math.floor(trialEndsOn(standing).getTime() / 1000)
				defaultTrialMonths = standing.months
				console.log(`[subscriptions/checkout] standing ${standing.months}-month trial applied for ${userId} until ${new Date(trialEnd * 1000).toISOString()}`)
			}
		}

		const baseUrl = (process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com").replace(/\/$/, "")
		const successUrl = `${baseUrl}${returnTo}?premium_session_id={CHECKOUT_SESSION_ID}`
		const cancelUrl = `${baseUrl}${returnTo}?premium_cancelled=1`

		// Which open-vs-bought funnel row this purchase closes, if any — see
		// `src/models/events/premium-page-view.ts`. Only `/premium` and `/subscribe` are tracked;
		// a checkout started elsewhere (the paywall modal) simply carries none of this and the
		// webhook leaves the funnel alone.
		const funnelPage = returnTo === "/premium" ? "premium" : returnTo === "/subscribe" ? "subscribe" : undefined
		const funnelAnonId = typeof req.body?.anonId === "string" ? req.body.anonId.trim() : ""
		// The RAW code as the visitor had it, not `trialCodeApplied`/`referralCodeApplied` — those
		// are normalized and only set once a code is accepted, but the funnel row was written the
		// moment the page loaded with this exact string, accepted or not.
		const funnelCode = rawInviteCode.trim()

		const checkoutSession = await stripe.checkout.sessions.create({
			customer: stripeCustomerId,
			client_reference_id: userId,
			mode: "subscription",
			line_items: [{ price: price.id, quantity: 1 }],
			success_url: successUrl,
			cancel_url: cancelUrl,
			// `inviteCode` rides along so the webhook can record WHICH code was redeemed. It was
			// previously applied to `trial_end` and then forgotten, leaving no way to answer how a
			// campaign performed.
			metadata: {
				userId,
				purpose: "premium_subscription",
				...(trialCodeApplied ? { inviteCode: trialCodeApplied } : {}),
				// No `inviteCode` for the standing offer — there was no code. Recorded on its own
				// key so the growth report can tell "started with a free month because that is
				// what we offer" apart from "redeemed a campaign code", which are different
				// questions with the same subscription object behind them.
				...(defaultTrialMonths > 0 ? { defaultTrialMonths: String(defaultTrialMonths) } : {}),
				// A referral code is recorded separately from an invite code, and with the event it
				// belongs to: the webhook needs both to count the redemption against the right row,
				// now that one code string can exist on several events.
				...(referralCodeApplied ? { referralCode: referralCodeApplied, referralEventId } : {}),
				// So the webhook can close the loop on the open-vs-bought funnel row this purchase
				// came from — the webhook never sees the browser or its anonId otherwise.
				...(funnelPage && funnelAnonId
					? {
							premiumPage: funnelPage,
							premiumAnonId: funnelAnonId,
							...(funnelCode ? { premiumCode: funnelCode } : {}),
						}
					: {}),
			},
			// Stamped so every webhook branch can identify the product without matching price
			// ids — the same marker `startMembershipSubscription` sets on the ones we create.
			// A card IS collected during a trial (Checkout's default), so the membership converts
			// on its own at `trial_end` instead of dying there — and the recurring terms are
			// disclosed before purchase, which the card networks require either way.
			subscription_data: {
				metadata: { membershipKey: "premium", userId },
				...(trialEnd ? { trial_end: trialEnd } : {}),
			},
		})

		return sendResponse(res, { url: checkoutSession.url }, "Subscription checkout created.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[subscriptions/checkout] Error:", error.message || error)
		return sendResponse(res, null, "Failed to start subscription checkout.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
