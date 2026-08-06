import { useQueries, useQuery } from "@tanstack/react-query"
import axios from "axios"
import { MEMBERSHIPS, type MembershipKey } from "@/lib/memberships"

/**
 * Public membership plans (price + billing interval).
 *
 * Needed wherever a bundled ticket is shown: card-network rules require the recurring amount
 * and interval be disclosed BEFORE purchase, not only on the receipt. `/api/subscriptions/plan`
 * is unauthenticated, so a guest sees it too.
 *
 * The query key is PARAMETERISED BY PRODUCT. It used to be a bare `["premium-plan"]`, which
 * with a second product would have served Full Concierge's price from Jetzy Premium's cache —
 * quoting the wrong figure on the disclosure that has to be right.
 *
 * `unitAmount` is in cents, straight from Stripe.
 */

export const membershipPlanQueryKey = (key: MembershipKey) => ["membership-plan", key]

/** @deprecated Use `membershipPlanQueryKey("premium")`. */
export const PREMIUM_PLAN_QUERY_KEY = membershipPlanQueryKey("premium")

export type PremiumPlanInfo = {
	membership?: MembershipKey
	name: string
	unitAmount: number | null
	currency: string
	interval: string
}

export type MembershipPlan = {
	key: MembershipKey
	/** The product name, e.g. "Full Concierge Membership". */
	name: string
	/** Price in dollars, or null while loading / if Stripe has no price configured. */
	amount: number | null
	interval: string
	/** e.g. "$59.50/month" — null until the real figure is known, never a placeholder. */
	label: string | null
}

const fetchPlan = async (key: MembershipKey): Promise<PremiumPlanInfo> => {
	const { data } = await axios.get(`/api/subscriptions/plan?membership=${key}`)
	return data?.data as PremiumPlanInfo
}

const toPlan = (key: MembershipKey, data?: PremiumPlanInfo): MembershipPlan => {
	const dollars = data?.unitAmount != null ? data.unitAmount / 100 : null
	const interval = data?.interval || "month"
	return {
		key,
		name: data?.name || MEMBERSHIPS[key].label,
		amount: dollars,
		interval,
		label: dollars != null ? `${dollars.toLocaleString("en-US", { style: "currency", currency: "usd" })}/${interval}` : null,
	}
}

export function useMembershipPlan(key: MembershipKey, enabled = true) {
	const query = useQuery({
		queryKey: membershipPlanQueryKey(key),
		queryFn: () => fetchPlan(key),
		enabled,
		staleTime: 5 * 60_000,
	})

	return { ...toPlan(key, query.data), plan: query.data, isLoading: query.isLoading }
}

/**
 * Plans for every membership a ticket sells — one, two, or none.
 *
 * `useQueries` rather than a loop of `useQuery`, because the set of products changes with the
 * selected ticket and React forbids a varying number of hook calls.
 */
export function useMembershipPlans(keys: MembershipKey[]) {
	const results = useQueries({
		queries: keys.map((key) => ({
			queryKey: membershipPlanQueryKey(key),
			queryFn: () => fetchPlan(key),
			staleTime: 5 * 60_000,
		})),
	})

	return {
		plans: keys.map((key, index) => toPlan(key, results[index]?.data as PremiumPlanInfo | undefined)),
		isLoading: results.some((r) => r.isLoading),
	}
}

/** @deprecated Premium-only shim. Use `useMembershipPlan("premium", …)`. */
export function usePremiumPlan(enabled = true) {
	return useMembershipPlan("premium", enabled)
}
