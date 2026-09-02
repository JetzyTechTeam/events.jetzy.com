/**
 * Invite codes that grant a free trial of Jetzy Premium.
 *
 * A trial, not a coupon. Stripe's `trial_end` bills nothing until the date it names and then
 * charges the normal price, which is exactly "two months free, then $20/month" — a 100%-off
 * coupon would instead raise a $0 invoice every cycle and needs product scoping so it can't
 * discount Full Concierge as well.
 *
 * `trialing` already counts as an active membership everywhere in this codebase (see
 * `hasActiveMembershipSubscription` and the webhook), so a trial member gets member benefits,
 * is skipped from being charged the membership on a bundled ticket, and reads as a member on
 * selectmember.jetzy.com, which shares this Stripe account and this database.
 *
 * Pure and isomorphic — the checkout UI previews the offer from the same table the server
 * enforces it from, so the two can't disagree about what a code is worth.
 *
 * NOT the same thing as either of the other "codes" in this product:
 *   - `refCode` on signup credits a REFERRER through the Jetzy backend;
 *   - a referral code at event checkout discounts a TICKET.
 * Nothing here touches either.
 */

export type TrialOffer = {
	/** Free months before the first real invoice. */
	months: number
	/**
	 * Which billing intervals the code is good for.
	 *
	 * A code that lists an interval it isn't meant for is a pricing decision, not a detail: the
	 * months are free either way, but what lands afterwards is $20 or $200. Whatever is listed
	 * here MUST be disclosed with the price and date it converts at — `trialDisclosure` and the
	 * plan card do that from the interval the buyer has actually selected, and the field is
	 * re-checked when they change it.
	 */
	intervals: string[]
	/** Shown to the buyer once the code is accepted. */
	label: string
}

export const TRIAL_CODES: Record<string, TrialOffer> = {
	// Monthly AND annual (product decision, 2026-08-18). On annual the same two months precede a
	// $200 charge rather than a $20 one, which is why the card states the amount and the date the
	// trial converts on rather than the bare "2 months free".
	"jetzy-me": { months: 2, intervals: ["month", "year"], label: "2 months free" },
	// A shorter offer for campaigns that don't warrant two months. Both intervals, same reasoning
	// as above — the card names the real amount and date either way, so "1 month free, then
	// $200/year from 26 Sep" is as honest on annual as it is on monthly.
	"1m-off": { months: 1, intervals: ["month", "year"], label: "1 month free" },
}

/**
 * The campaign code `/premium` prefills for every visitor.
 *
 * A public landing page we email people is a campaign in itself — expecting the recipient to type
 * a code they were shown in the same email is a step that loses people for no reason. Change this
 * one constant when the campaign changes; leave it as `""` to prefill nothing.
 *
 * It must exist in `TRIAL_CODES` above, or the field prefills something the server will refuse.
 */
export const DEFAULT_INVITE_CODE = "jetzy-me"

/** Codes are matched case- and whitespace-insensitively: people type them from a screenshot. */
export const normalizeTrialCode = (code?: string | null): string => (code || "").trim().toLowerCase()

export type TrialResolution =
	| { ok: true; code: string; offer: TrialOffer }
	| { ok: false; reason: "unknown" | "interval"; message: string }

/**
 * Is this code good for this billing interval?
 *
 * Returns a REASON rather than a bare null, because "we've never heard of that code" and "that
 * code is monthly only" need different words in front of a buyer who is about to pay.
 */
export const resolveTrialCode = (rawCode?: string | null, interval?: string | null): TrialResolution => {
	const code = normalizeTrialCode(rawCode)
	const offer = TRIAL_CODES[code]

	if (!offer) {
		return { ok: false, reason: "unknown", message: "That invite code isn't valid. Check it, or leave it blank." }
	}

	if (interval && !offer.intervals.includes(interval)) {
		const allowed = offer.intervals.includes("month") ? "monthly" : offer.intervals.join(" or ")
		return { ok: false, reason: "interval", message: `This code applies to the ${allowed} plan. Switch to it to use the code.` }
	}

	return { ok: true, code, offer }
}

/**
 * "2 months free, then $20/month from 18 Oct 2026" — the recurring terms, before purchase.
 *
 * It used to end "Cancel any time." as well. The plan card now says that once, as its own
 * sentence and with a link to how it is done (CEO, 2026-09-02) — repeating it here put the same
 * three words twice on one card, in the second-smallest text on it, pointing at nothing.
 */
export const trialDisclosure = (offer: TrialOffer, priceLabel: string | null, startsCharging: Date): string => {
	const date = startsCharging.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
	return priceLabel ? `${offer.label}, then ${priceLabel} from ${date}.` : `${offer.label}.`
}

/**
 * An accepted offer, as the plan card needs it: enough to show $0 today and say what is charged
 * when, without the card having to parse the sentence under the invite field.
 */
export type AppliedTrial = { months: number; label: string; chargesFrom: string | null }

/**
 * Are these the same offer?
 *
 * Used to hold the STATE IDENTITY steady. Every resolution builds a fresh object, and React only
 * bails out of a state write when the value is `Object.is`-equal — so writing an equal-but-new
 * object on each run of the debounced invite effect renders, and if anything that effect depends
 * on is itself rebuilt per render, that render runs the effect again. That loop shipped once: a
 * permanent "Checking…" and a request to `/api/subscriptions/invite-code` every 600ms.
 */
export const sameAppliedTrial = (a: AppliedTrial | null, b: AppliedTrial | null): boolean =>
	a === b || (!!a && !!b && a.months === b.months && a.label === b.label && a.chargesFrom === b.chargesFrom)

/** When the first real invoice lands. */
export const trialEndsOn = (offer: TrialOffer, from: Date = new Date()): Date => {
	const end = new Date(from)
	end.setMonth(end.getMonth() + offer.months)
	return end
}

/**
 * Is this string one of our trial codes?
 *
 * Lives HERE, not in `signup-trial.ts`, because both signup forms call it: that module reaches
 * SendGrid and the models through dynamic imports, and webpack follows those into the client
 * bundle, where `fs` doesn't exist. Keeping the pure half separate is what makes the forms able
 * to resolve a code without shipping the server with them.
 */
export const isSignupTrialCode = (code?: string | null): boolean => resolveTrialCode(code, "month").ok

/** The offer behind a typed code, so a form can say what it is worth before submitting. */
export const signupTrialOffer = (code?: string | null): TrialOffer | null => {
	const resolved = resolveTrialCode(code, "month")
	return resolved.ok ? resolved.offer : null
}

