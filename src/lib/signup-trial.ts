import { resolveTrialCode, trialEndsOn } from "@/lib/invite-trial"

// `isSignupTrialCode` / `signupTrialOffer` live in `invite-trial.ts`: the signup FORMS need them,
// and everything below reaches Stripe, Mongo and SendGrid.

/**
 * An invite code typed at SIGNUP grants free months of Jetzy Premium, there and then.
 *
 * Different from the same code at `/subscribe` in one decisive way: **no card is collected**.
 * The subscription is created with `trial_settings.end_behavior.missing_payment_method: "cancel"`
 * (inside `startMembershipSubscription`), so when the free months run out Stripe ends it instead
 * of raising an invoice nobody can pay. It is a gift that expires, not a subscription that
 * starts quietly billing someone who never entered a card — which is also why nothing here has
 * to disclose a recurring charge: there isn't one until they choose to add one.
 *
 * GRANTED ONCE PER EMAIL ADDRESS, and only to an address that has been proven:
 *   - `/signup` grants at `complete-signup`, after the verification link is followed;
 *   - `/jetzyqrsignup` grants at account creation, where the password only ever reaches them
 *     by email, so an address they don't control gets them nothing.
 *
 * Signup is open to anyone, so the one-per-address rule is the only thing between this and an
 * unlimited supply of free memberships. It is checked against `membership_purchases` (every sale
 * ever recorded for that address) AND against Stripe's own history for the customer, because our
 * copy only exists for sales made since that collection did.
 *
 * Best-effort from end to end. A failed grant must never stop somebody finishing their signup —
 * they came here to make an account, not to redeem a code.
 */

export type SignupTrialResult = {
	granted: boolean
	months?: number
	/** Why it wasn't granted. Logged, never shown — the code is a bonus, not a purchase. */
	reason?: "no-code" | "unknown-code" | "already-member" | "already-redeemed" | "no-customer" | "failed"
}

export async function grantSignupTrial({
	email,
	firstName,
	userId,
	code,
}: {
	email: string
	firstName?: string
	/** The account the membership belongs to. */
	userId: string
	code?: string | null
}): Promise<SignupTrialResult> {
	const trimmed = (code || "").trim()
	if (!trimmed) return { granted: false, reason: "no-code" }

	// Monthly, always: the gift is priced at the plan it would convert to, and the annual plan
	// is not something to hand someone who hasn't entered a card.
	const resolved = resolveTrialCode(trimmed, "month")
	if (!resolved.ok) return { granted: false, reason: "unknown-code" }

	try {
		const { MembershipPurchases } = await import("@/models/events/membership-purchases")
		const { heldMemberships } = await import("@/lib/premium-eligibility")
		const { getMembershipPrice, hasEverHadMembership, resolveStripeCustomerForUser } = await import("@/lib/premium")
		const { startMembershipSubscription } = await import("@/lib/membership-subscriptions")
		const { sendMembershipStarted } = await import("@/lib/send-grid")
		const { MEMBERSHIPS } = await import("@/lib/memberships")

		const clean = email.trim()
		// Case-insensitive: neither user collection declares `lowercase: true` on email, and
		// `membership_purchases` stores whatever was passed in.
		const emailMatch = { $regex: `^${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }

		// Already has it — through a ticket, another Jetzy surface, anything.
		const held = await heldMemberships(clean, ["premium"])
		if (held.includes("premium")) return { granted: false, reason: "already-member" }

		// Already had this gift, or bought a membership before. One per address, ever.
		const previous = await MembershipPurchases.findOne({ email: emailMatch, key: "premium" }).select("_id").lean()
		if (previous) return { granted: false, reason: "already-redeemed" }

		const customerId = await resolveStripeCustomerForUser(userId, clean)
		if (!customerId) return { granted: false, reason: "no-customer" }

		// Stripe is the authority on billing history — our own record only goes back as far as
		// `membership_purchases` does, which is recent.
		if (await hasEverHadMembership(customerId, "premium")) return { granted: false, reason: "already-redeemed" }

		const price = await getMembershipPrice("premium")

		const result = await startMembershipSubscription({
			key: "premium",
			priceId: price.id,
			interval: price.recurring?.interval || "month",
			customerId,
			// Deliberately NO `paymentMethodId`: nothing was collected, and that absence is what
			// makes Stripe cancel at the end rather than bill.
			email: clean,
			subscriberId: userId,
			trialMonths: resolved.offer.months,
			source: "signup",
			inviteCode: resolved.code,
			metadata: { signupTrial: resolved.code },
		})

		if (!result.created) return { granted: false, reason: "already-member" }

		try {
			await sendMembershipStarted({
				email: clean,
				firstName,
				amount: price.unit_amount != null ? price.unit_amount / 100 : 0,
				interval: price.recurring?.interval || "month",
				label: MEMBERSHIPS.premium.label,
				trialEndsOn: result.firstRenewalAt || trialEndsOn(resolved.offer),
				// No card, so it ENDS rather than renews. Saying "renews until you cancel" here
				// would be plainly untrue and would have people waiting for a charge that never
				// comes while their membership quietly lapses.
				endsWithoutCard: true,
			})
		} catch (emailError: any) {
			console.error("[signup-trial] Membership started but the welcome email failed:", emailError?.message || emailError)
		}

		console.log(`[signup-trial] Granted ${resolved.offer.months} months of Jetzy Premium to ${clean} (code ${resolved.code})`)
		return { granted: true, months: resolved.offer.months }
	} catch (error: any) {
		console.error("[signup-trial] Could not grant the signup trial:", error?.message || error)
		return { granted: false, reason: "failed" }
	}
}
