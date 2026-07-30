import Stripe from "stripe"

/**
 * Shared Stripe client.
 *
 * Lazily constructed so the SDK isn't instantiated at module load in routes that may
 * never touch Stripe, and cached so repeated API calls reuse one HTTP agent.
 *
 * No `apiVersion` is pinned here, matching the rest of the codebase — the account's
 * default version applies.
 */
let stripeInstance: Stripe | null = null

export function getStripeClient(): Stripe {
	if (!stripeInstance) {
		stripeInstance = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)
	}
	return stripeInstance
}
