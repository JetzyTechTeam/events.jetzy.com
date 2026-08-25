/**
 * Pure helpers for sharing a referral code as a Jetzy Premium link.
 *
 * Deliberately separate from `referral-trial.ts`: that one reaches Mongo through
 * `referral-validation.ts`, which imports mongoose at the top level, and webpack follows that
 * into any client bundle that touches the module. Same split, same reason, as
 * `invite-trial.ts` versus `signup-trial.ts` — the host console imports only this file.
 */

/**
 * Can this code be shared as a standalone Premium link, and if not, why?
 *
 * Both rules exist because a shared link gives a membership away with no ticket behind it:
 * without free months there is nothing to share, and without a usage limit a forwarded link is an
 * unbounded giveaway. `resolveReferralTrial` re-checks the same two at redemption, so a host who
 * clears the limit later kills the links already out there.
 */
export const shareableReason = (code: { freeMembershipMonths?: number; maxUses?: number | null }): string | null => {
	if (!code.freeMembershipMonths || code.freeMembershipMonths <= 0) {
		return "Add free months of Jetzy Premium to this code before sharing it as a membership link."
	}
	if (code.maxUses === null || code.maxUses === undefined) {
		return "Set a maximum number of uses first — a shared link with no limit gives away unlimited memberships."
	}
	return null
}

/** `https://events.jetzy.com/premium?code=JETZY-ME&event=…` — the code alone is ambiguous now that codes are unique per event. */
export const premiumShareLink = (origin: string, code: string, eventId: string): string =>
	`${origin}/premium?code=${encodeURIComponent(code)}&event=${encodeURIComponent(eventId)}`
