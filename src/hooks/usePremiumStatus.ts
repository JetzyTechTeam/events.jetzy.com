import { useQuery } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import axios from "axios"

export const PREMIUM_STATUS_QUERY_KEY = ["premium-status"]

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
			return data?.data?.premiumSubscription as PremiumSubscription
		},
		enabled: isLoggedIn,
		staleTime: 30_000,
	})

	return {
		isPremium: !!query.data?.active,
		isLoading: isLoggedIn && query.isLoading,
		subscription: query.data,
	}
}
