/**
 * Order pricing breakdown for ticket confirmation emails (and anything else that needs
 * to show what a buyer actually paid).
 *
 * Discounts stack multiplicatively, matching how the single Stripe coupon is composed in
 * `api/checkout/index.ts`: the Premium member rate is applied first, then the referral
 * rate on the remainder. Splitting them back out here means the email can show two
 * honest line items whose amounts sum exactly to `subtotal - total`, rather than
 * crediting the whole reduction to whichever one happens to be named.
 */

/**
 * Stripe refuses to create a charge below 50¢ USD — including a manual-capture
 * authorization, so approval holds are not exempt. A ticket priced between $0.01 and
 * $0.49 therefore looks fine everywhere until the buyer reaches checkout, where the
 * session creation fails outright. Validate against this before money is involved.
 */
export const STRIPE_MIN_CHARGE_USD = 0.5

/** True for an amount that is payable in principle but below Stripe's floor. $0 is free, not below. */
export const isBelowStripeMinimum = (amount: number): boolean => {
	const value = Number(amount)
	return Number.isFinite(value) && value > 0 && value < STRIPE_MIN_CHARGE_USD
}

export const BELOW_MIN_PRICE_MESSAGE = "Ticket price must be $0 (free) or at least $0.50 — Stripe won't process a smaller charge."

export type PricingLine = { label: string; amount: number }

export type TicketPricing = {
	subtotal: number
	/** Discount lines, each a positive amount to be shown as a deduction. */
	lines: PricingLine[]
	total: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type BuildPricingInput = {
	/** Sum of price x quantity before any discount. */
	subtotal: number
	referralCode?: string | null
	referralPercentage?: number | null
	premiumPercentage?: number | null
	/**
	 * The amount actually charged. When supplied it wins over the computed figure, so the
	 * email can never disagree with Stripe. Any rounding difference is absorbed into the
	 * last discount line.
	 */
	total?: number | null
	/**
	 * Fallback for bookings saved before the two rates were stored separately: a single
	 * combined discount amount, shown as one unattributed line.
	 */
	combinedDiscountAmount?: number | null
}

export function buildTicketPricing({
	subtotal,
	referralCode,
	referralPercentage,
	premiumPercentage,
	total,
	combinedDiscountAmount,
}: BuildPricingInput): TicketPricing {
	const base = round2(Math.max(0, Number(subtotal) || 0))
	const premiumPct = Math.max(0, Number(premiumPercentage) || 0)
	const referralPct = Math.max(0, Number(referralPercentage) || 0)

	const lines: PricingLine[] = []

	if (premiumPct > 0 || referralPct > 0) {
		// Premium first, referral on what's left — the order the Stripe coupon encodes.
		const premiumAmount = round2(base * (premiumPct / 100))
		const referralAmount = round2(base * (1 - premiumPct / 100) * (referralPct / 100))

		if (premiumAmount > 0) {
			lines.push({ label: `Jetzy Premium member discount (${premiumPct}%)`, amount: premiumAmount })
		}
		if (referralAmount > 0) {
			lines.push({
				label: referralCode
					? `Referral ${referralCode} (${referralPct}% off)`
					: `Referral discount (${referralPct}% off)`,
				amount: referralAmount,
			})
		}
	} else if (combinedDiscountAmount && combinedDiscountAmount > 0) {
		// Legacy booking: the rates weren't recorded, so it can only be shown as one line.
		lines.push({
			label: referralCode ? `Discount (${referralCode})` : "Discount",
			amount: round2(combinedDiscountAmount),
		})
	}

	const discounted = round2(base - lines.reduce((sum, l) => sum + l.amount, 0))
	const resolvedTotal = total !== undefined && total !== null ? round2(Math.max(0, total)) : Math.max(0, discounted)

	// Reconcile: if Stripe's total and our arithmetic disagree by a cent or two (percentage
	// rounding), adjust the last line so subtotal - lines === total holds in the email.
	if (lines.length > 0) {
		const drift = round2(discounted - resolvedTotal)
		if (drift !== 0) {
			const last = lines[lines.length - 1]
			last.amount = round2(Math.max(0, last.amount + drift))
		}
	}

	return { subtotal: base, lines, total: resolvedTotal }
}

/** Convenience for the email callers that already hold a booking document. */
export function pricingFromBooking(
	booking: {
		subTotal?: number
		total?: number
		referralCode?: string
		discountAmount?: number
		referralDiscountPercentage?: number
		premiumMemberDiscountPercentage?: number
	},
	fallbackSubtotal?: number,
): TicketPricing {
	return buildTicketPricing({
		subtotal: booking.subTotal ?? fallbackSubtotal ?? 0,
		referralCode: booking.referralCode,
		referralPercentage: booking.referralDiscountPercentage,
		premiumPercentage: booking.premiumMemberDiscountPercentage,
		total: booking.total,
		combinedDiscountAmount: booking.discountAmount,
	})
}
