import {
	CHECKOUT_VERIFICATION_TYPES,
	EMAIL_VERIFIED,
	VERIFY_CODE_FAILED,
	VERIFY_CODE_SENT,
	VERIFY_SKIPPED,
	emptyCheckoutVerificationStats,
	type CheckoutVerificationStats,
} from "@/lib/checkout-verification-events"

/**
 * Server only — counts the checkout email-check steps (`checkout-verification-events.ts`) for
 * any slice of `eventinteractions`: one event, every event, a date range, and optionally split
 * by a field (the marketing-link report splits by `marketingLinkId`). ONE definition, so the
 * per-event page, the main analytics page and the marketing links never disagree.
 *
 * Judged PER SESSION: a session that got a code and then verified counts once in each, and
 * "never verified" is a session with a code and no success — not codes minus successes, which a
 * resend would skew.
 */
export async function getCheckoutVerificationStats(
	match: Record<string, any>,
	splitBy?: string,
): Promise<Map<string, CheckoutVerificationStats>> {
	const { ensureDbConnected } = await import("@/configs/database")
	await ensureDbConnected()
	const { EventInteraction } = await import("@/models/analytics")

	const has = (t: string) => ({ $in: [t, "$types"] })
	const rows = await EventInteraction.aggregate([
		{ $match: { ...match, interactionType: { $in: CHECKOUT_VERIFICATION_TYPES as unknown as string[] } } },
		{
			$group: {
				_id: { split: splitBy ? `$${splitBy}` : null, sid: "$sessionId" },
				types: { $addToSet: "$interactionType" },
				wrong: { $sum: { $cond: [{ $eq: ["$interactionType", VERIFY_CODE_FAILED] }, 1, 0] } },
				sends: { $sum: { $cond: [{ $eq: ["$interactionType", VERIFY_CODE_SENT] }, 1, 0] } },
			},
		},
		{
			$group: {
				_id: "$_id.split",
				codeSent: { $sum: { $cond: [has(VERIFY_CODE_SENT), 1, 0] } },
				verified: { $sum: { $cond: [has(EMAIL_VERIFIED), 1, 0] } },
				neverVerified: { $sum: { $cond: [{ $and: [has(VERIFY_CODE_SENT), { $not: [has(EMAIL_VERIFIED)] }] }, 1, 0] } },
				alreadySignedIn: { $sum: { $cond: [{ $and: [has(VERIFY_SKIPPED), { $not: [has(EMAIL_VERIFIED)] }] }, 1, 0] } },
				confirmed: { $sum: { $cond: [{ $or: [has(EMAIL_VERIFIED), has(VERIFY_SKIPPED)] }, 1, 0] } },
				wrongCodeAttempts: { $sum: "$wrong" },
				resends: { $sum: { $max: [{ $subtract: ["$sends", 1] }, 0] } },
			},
		},
	])

	const out = new Map<string, CheckoutVerificationStats>()
	for (const r of rows) {
		const stats = emptyCheckoutVerificationStats()
		for (const k of Object.keys(stats) as Array<keyof CheckoutVerificationStats>) stats[k] = Number(r[k]) || 0
		out.set(r._id ? String(r._id) : "", stats)
	}
	return out
}

/** The un-split total for a match — `emptyCheckoutVerificationStats()` when nothing matched. */
export async function getCheckoutVerificationTotals(match: Record<string, any>): Promise<CheckoutVerificationStats> {
	const map = await getCheckoutVerificationStats(match)
	return map.get("") || emptyCheckoutVerificationStats()
}
