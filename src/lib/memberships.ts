/**
 * The membership products a ticket can sell.
 *
 * There used to be exactly one — Jetzy Premium — and its product id, its user field and its
 * name were hardcoded at roughly thirty call sites. Adding Full Concierge made that
 * assumption dangerous rather than merely untidy: the Stripe webhook wrote
 * `premiumSubscription` for ANY subscription on the customer, and one Stripe Customer is
 * shared by both products, so a Concierge purchase would have overwritten the buyer's
 * Premium record and cancelling Concierge would have revoked their Premium.
 *
 * Everything that needs to know "which product is this?" resolves it here.
 *
 * Pure and isomorphic — no Stripe client, no models. Safe to import from React.
 */

export type MembershipKey = "premium" | "concierge"

/** Iteration order. Fixed so line items, receipts and captures are deterministic. */
export const MEMBERSHIP_KEYS: MembershipKey[] = ["premium", "concierge"]

export type MembershipDefinition = {
	key: MembershipKey
	/** Buyer-facing name — Stripe line items, checkout copy, emails. */
	label: string
	/**
	 * The name as it reads on a receipt line, where the word "membership" is expected.
	 * Stored rather than derived, because `${label} membership` yields "Full Concierge
	 * Membership membership" for a product whose name already contains the word.
	 */
	receiptLabel: string
	/** Short form for tight UI (chips, table cells). */
	shortLabel: string
	/**
	 * Stripe product id. Env-overridable so test and live environments differ without a
	 * code change; the fallback is the PRODUCTION id, so a misconfigured non-production
	 * environment fails loudly at `products.retrieve` rather than quietly selling the
	 * wrong thing.
	 */
	productId: string
	/** Dot-path prefix of the subscription sub-document on `Users` / `EventUsers`. */
	userField: "premiumSubscription" | "conciergeSubscription"
	/**
	 * The plan identifier selectmember.jetzy.com expects, when this product is theirs.
	 * Absent means "we own this membership outright; nothing to mirror".
	 */
	selectMemberPlan?: string
}

export const MEMBERSHIPS: Record<MembershipKey, MembershipDefinition> = {
	premium: {
		key: "premium",
		label: "Jetzy Premium",
		receiptLabel: "Jetzy Premium membership",
		shortLabel: "Premium",
		productId: process.env.NEXT_STRIPE_PREMIUM_PRODUCT_ID || "prod_Uxn2R9FQd5F3sp",
		userField: "premiumSubscription",
	},
	concierge: {
		key: "concierge",
		label: "Full Concierge Membership",
		receiptLabel: "Full Concierge Membership",
		shortLabel: "Concierge",
		// Production `prod_UlQTOgXS73TAEV`; staging `prod_UjabUJ9OXWhLPJ` must be supplied
		// through the env var.
		productId: process.env.NEXT_STRIPE_CONCIERGE_PRODUCT_ID || "prod_UlQTOgXS73TAEV",
		userField: "conciergeSubscription",
		selectMemberPlan: "select_monthly",
	},
}

export const isMembershipKey = (value: unknown): value is MembershipKey =>
	typeof value === "string" && Object.prototype.hasOwnProperty.call(MEMBERSHIPS, value)

/** Narrow an untrusted array (request body, Mongo document) to known keys, order-normalised. */
export const sanitizeMembershipKeys = (value: unknown): MembershipKey[] => {
	if (!Array.isArray(value)) return []
	const seen = new Set(value.filter(isMembershipKey))
	return MEMBERSHIP_KEYS.filter((key) => seen.has(key))
}

export const membershipLabel = (key: MembershipKey): string => MEMBERSHIPS[key]?.label || "Membership"

/** "Jetzy Premium and Full Concierge Membership" — for copy that names what a ticket sells. */
export const membershipLabelList = (keys: MembershipKey[]): string => {
	const labels = keys.map(membershipLabel)
	if (labels.length === 0) return ""
	if (labels.length === 1) return labels[0]
	return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
}

/**
 * Which membership is a Stripe product id?
 *
 * Returns null for anything unrecognised — a subscription for some other product (a plan
 * sold by another Jetzy surface against the same Stripe account) must be left alone, never
 * guessed at. Every webhook branch depends on this.
 */
export const membershipKeyForProductId = (productId?: string | null): MembershipKey | null => {
	if (!productId) return null
	return MEMBERSHIP_KEYS.find((key) => MEMBERSHIPS[key].productId === productId) || null
}
