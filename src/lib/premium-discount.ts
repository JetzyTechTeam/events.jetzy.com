/**
 * The pure, isomorphic half of the Jetzy Premium member discount.
 *
 * Kept apart from `premium-eligibility.ts` deliberately: that module reaches into the
 * `Users` / `EventUsers` collections and must never reach a client bundle, but the checkout
 * modal and the ticket card both need to know whether an event offers a member rate at all.
 * Import this one from React; import that one from API routes.
 */

type EventLike = { premium?: boolean; premiumMemberDiscountPercentage?: number } | null | undefined

/**
 * The member rate this event offers, or 0 when it offers none.
 *
 * A non-premium event never has one, and a premium event with the perk left at 0 is the same
 * thing as not offering it — so callers get a single number to branch on instead of
 * re-deriving `event.premium && Number(pct) > 0` in five places.
 */
export function eventMemberDiscountPercentage(event: EventLike): number {
	if (!event?.premium) return 0
	const pct = Number(event.premiumMemberDiscountPercentage)
	if (!Number.isFinite(pct) || pct <= 0) return 0
	return Math.min(100, pct)
}
