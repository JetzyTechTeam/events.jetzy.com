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

/** One interval this membership is sold at, straight from the API. */
export type PremiumPlanPriceInfo = {
	id: string
	unitAmount: number | null
	currency: string
	interval: string
	intervalCount?: number
	isDefault?: boolean
}

export type PremiumPlanInfo = {
	membership?: MembershipKey
	name: string
	unitAmount: number | null
	currency: string
	interval: string
	/** Every interval on sale. Absent from responses served before annual existed. */
	prices?: PremiumPlanPriceInfo[]
}

/** A selectable interval, formatted for display. */
export type MembershipPlanPrice = {
	id: string
	amount: number | null
	interval: string
	/** e.g. "$200/year" — null until the real figure is known, never a placeholder. */
	label: string | null
	isDefault: boolean
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
	/**
	 * Every interval on sale, cheapest first — monthly then annual for Jetzy Premium.
	 *
	 * `amount`/`interval`/`label` above stay the product's DEFAULT price, because they are what
	 * the bundled-ticket disclosure renders and that must not change meaning. Anything offering
	 * a choice reads this instead.
	 */
	prices: MembershipPlanPrice[]
}

const fetchPlan = async (key: MembershipKey): Promise<PremiumPlanInfo> => {
	const { data } = await axios.get(`/api/subscriptions/plan?membership=${key}`)
	return data?.data as PremiumPlanInfo
}

/**
 * "$20/month", "$200/year".
 *
 * Whole dollars drop the cents; anything with a fractional part keeps both digits, so $59.50 is
 * never rounded away from the figure the buyer is actually charged. Returns null rather than a
 * placeholder — the price is a disclosure, and a wrong one is worse than a spinner.
 */
const priceLabel = (dollars: number | null, interval: string): string | null =>
	dollars != null
		? `${dollars.toLocaleString("en-US", {
				style: "currency",
				currency: "usd",
				minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
		  })}/${interval}`
		: null

/**
 * The plan's price at a given interval, for disclosing a bundled ticket sold annually.
 *
 * Falls back to the product default when that interval isn't on sale — Full Concierge is
 * monthly only, and this MUST match `api/checkout`, which resolves the same way
 * (`findMembershipPriceForInterval(...) || getMembershipPrice(...)`). A UI that quoted an
 * annual figure the server then charged monthly would be a disclosure failure.
 */
export const planPriceForInterval = (
	plan: Pick<MembershipPlan, "amount" | "interval" | "label" | "prices">,
	interval?: string | null,
): { amount: number | null; interval: string; label: string | null } => {
	const match = interval ? (plan.prices || []).find((p) => p.interval === interval) : undefined
	if (match) return { amount: match.amount, interval: match.interval, label: match.label }
	return { amount: plan.amount, interval: plan.interval, label: plan.label }
}

const toPlan = (key: MembershipKey, data?: PremiumPlanInfo): MembershipPlan => {
	const dollars = data?.unitAmount != null ? data.unitAmount / 100 : null
	const interval = data?.interval || "month"
	return {
		key,
		name: data?.name || MEMBERSHIPS[key].label,
		amount: dollars,
		interval,
		label: priceLabel(dollars, interval),
		prices: (data?.prices || []).map((p) => {
			const amount = p.unitAmount != null ? p.unitAmount / 100 : null
			return {
				id: p.id,
				amount,
				interval: p.interval || "month",
				label: priceLabel(amount, p.interval || "month"),
				isDefault: !!p.isDefault,
			}
		}),
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

/** What the member is on right now, straight from their Stripe subscription. */
export type CurrentMembershipPlan = {
	active: boolean
	/** "month" | "year", or null when Stripe couldn't be reached / the record predates a sub id. */
	interval: string | null
	/** Dollars. Null whenever `interval` is. */
	amount: number | null
	/** e.g. "$20/month". Null rather than a placeholder — same rule as everywhere else here. */
	label: string | null
	renewsAt: string | null
	cancelAtPeriodEnd: boolean
	status: string | null
	/** Whether to offer the switch. Server-decided: monthly members only. */
	canSwitch: boolean
}

export const currentMembershipPlanQueryKey = ["membership-plan", "premium", "current"]

/**
 * The logged-in member's live Jetzy Premium plan.
 *
 * Deliberately its own query key and its own endpoint — see `/api/subscriptions/current-plan`
 * for why this must not ride on `/api/subscriptions/me`, which the navbar polls on every page.
 * `enabled` so a non-member never fires it at all.
 */
export function useCurrentMembershipPlan(enabled = true) {
	const query = useQuery({
		queryKey: currentMembershipPlanQueryKey,
		queryFn: async () => {
			const { data } = await axios.get("/api/subscriptions/current-plan")
			return data?.data as {
				active: boolean
				interval: string | null
				unitAmount: number | null
				currency: string | null
				priceId: string | null
				renewsAt: string | null
				cancelAtPeriodEnd: boolean
				status: string | null
				canSwitch: boolean
			}
		},
		enabled,
		staleTime: 60_000,
	})

	const data = query.data
	const amount = data?.unitAmount != null ? data.unitAmount / 100 : null

	const plan: CurrentMembershipPlan = {
		active: !!data?.active,
		interval: data?.interval || null,
		amount,
		label: data?.interval ? priceLabel(amount, data.interval) : null,
		renewsAt: data?.renewsAt || null,
		cancelAtPeriodEnd: !!data?.cancelAtPeriodEnd,
		status: data?.status || null,
		canSwitch: !!data?.canSwitch,
	}

	return { currentPlan: plan, isLoading: enabled && query.isLoading }
}
