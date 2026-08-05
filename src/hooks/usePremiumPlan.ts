import { useQuery } from "@tanstack/react-query"
import axios from "axios"

export const PREMIUM_PLAN_QUERY_KEY = ["premium-plan"]

export type PremiumPlanInfo = {
	name: string
	unitAmount: number | null
	currency: string
	interval: string
}

/**
 * The public Jetzy Premium plan (price + billing interval).
 *
 * Needed wherever a bundled ticket (`IEventTicket.includesPremium`) is shown: card-network
 * rules require the recurring amount and interval be disclosed BEFORE purchase, not only on
 * the receipt. `/api/subscriptions/plan` is unauthenticated, so a guest sees it too.
 *
 * `unitAmount` is in cents, straight from Stripe.
 */
export function usePremiumPlan(enabled = true) {
	const query = useQuery({
		queryKey: PREMIUM_PLAN_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axios.get("/api/subscriptions/plan")
			return data?.data as PremiumPlanInfo
		},
		enabled,
		staleTime: 5 * 60_000,
	})

	const dollars = query.data?.unitAmount != null ? query.data.unitAmount / 100 : null

	return {
		plan: query.data,
		/** Price in dollars, or null while loading / if Stripe has no price configured. */
		amount: dollars,
		interval: query.data?.interval || "month",
		/** e.g. "$9.99/month" — null until the real figure is known, never a placeholder. */
		label: dollars != null ? `${dollars.toLocaleString("en-US", { style: "currency", currency: "usd" })}/${query.data?.interval || "month"}` : null,
		isLoading: query.isLoading,
	}
}
