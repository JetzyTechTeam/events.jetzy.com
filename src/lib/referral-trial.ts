import { validateReferralCodeForEvent } from "@/lib/referral-validation"

/**
 * A referral code redeemed as a STANDALONE Jetzy Premium trial — no ticket, no purchase.
 *
 * The months on a referral code were built for a ticket that already sells Premium: the host sells
 * something, Jetzy takes the ticket revenue, and the membership rides along. A shared
 * `/premium?code=…&event=…` link has none of that — it gives a membership away for nothing — so it
 * carries two rules the ticket path doesn't need:
 *
 *   1. the code must actually grant months (`freeMembershipMonths > 0`);
 *   2. the code must have a `maxUses` limit. A link can be forwarded, screenshotted or posted
 *      publicly, and an unlimited code behind a public URL is an unlimited supply of free
 *      memberships. Re-checked here at redemption, not just when the host copies the link, so
 *      clearing the limit later kills the links already out there rather than opening the gate.
 *
 * Everything else — active, not deleted, under its usage cap — is `validateReferralCodeForEvent`'s
 * job, and stays there so the ticket path and this one can't drift apart. The first-timer rule
 * (never had Premium) belongs to the caller, which is where the Stripe customer is known.
 *
 * One resolver for both the preview and the charge, so what the link promises and what the
 * subscription does cannot disagree.
 */

export type ReferralTrialResolution =
	| { ok: true; code: string; eventId: string; months: number }
	| { ok: false; message: string }

export async function resolveReferralTrial(
	eventId: string | undefined | null,
	rawCode: string | undefined | null,
): Promise<ReferralTrialResolution> {
	const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : ""
	if (!code) return { ok: false, message: "Enter a code." }
	if (!eventId) return { ok: false, message: "That link is missing its event." }

	const validation = await validateReferralCodeForEvent(eventId, code)
	if (!validation.ok) return { ok: false, message: validation.message }
	// `data: null` only happens for an empty code, which is refused above.
	if (!validation.data) return { ok: false, message: "Invalid or inactive referral code" }

	if (!validation.data.freeMembershipMonths || validation.data.freeMembershipMonths <= 0) {
		return { ok: false, message: "This code doesn't include free months of Jetzy Premium." }
	}

	// The usage limit is the only thing standing between a forwarded link and an unbounded
	// giveaway, so its absence is a refusal rather than a default.
	const { ReferralCodes } = await import("@/models/events/referral-codes")
	const { Types } = await import("mongoose")
	const record = await ReferralCodes.findOne({
		eventId: new Types.ObjectId(eventId),
		code,
		isDeleted: false,
		isActive: true,
	})
		.select("maxUses")
		.lean()

	const maxUses = (record as any)?.maxUses
	if (maxUses === null || maxUses === undefined) {
		return { ok: false, message: "This code can't be used here — it has no usage limit set." }
	}

	return {
		ok: true,
		code: validation.data.code,
		eventId: String(eventId),
		months: validation.data.freeMembershipMonths,
	}
}
