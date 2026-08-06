import { useQuery } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import axios from "axios"

// Parameterised by product even though only Premium is read here today — an unkeyed
// `["premium-status"]` is how a second membership would end up served from the first's cache.
export const PREMIUM_STATUS_QUERY_KEY = ["membership-status", "premium"]

type PremiumSubscription = {
	active: boolean
	status?: string
	currentPeriodEnd?: string
	cancelAtPeriodEnd?: boolean
}

// Shared across every component that needs the logged-in user's Jetzy Premium status
// (Navbar badge, event checkout gating) — react-query dedupes/caches this by key so
// mounting it in multiple places doesn't cause duplicate network requests.
export function usePremiumStatus() {
	const { status: sessionStatus } = useSession()
	const isLoggedIn = sessionStatus === "authenticated"

	const query = useQuery({
		queryKey: PREMIUM_STATUS_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axios.get("/api/subscriptions/me")
			return data?.data as {
				premiumSubscription?: PremiumSubscription
				memberships?: Record<string, PremiumSubscription>
				hasBillingAccount?: boolean
			}
		},
		enabled: isLoggedIn,
		staleTime: 30_000,
	})

	const memberships = query.data?.memberships || {}

	return {
		isPremium: !!query.data?.premiumSubscription?.active,
		/** Any membership at all — what "you have something to manage" should be gated on. */
		hasAnyMembership: Object.values(memberships).some((m) => !!m?.active),
		/**
		 * True once this user has a Stripe Customer. Broader than `hasAnyMembership` on
		 * purpose: someone whose subscription is `past_due`, or cancelling at period end, still
		 * needs the billing portal.
		 */
		hasBillingAccount: !!query.data?.hasBillingAccount,
		memberships,
		isLoading: isLoggedIn && query.isLoading,
		subscription: query.data?.premiumSubscription,
	}
}
