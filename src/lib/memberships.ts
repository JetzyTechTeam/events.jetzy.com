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
	 * One line on what the membership gets you, shown at checkout above the billing terms.
	 * Per-product because the two sell different things — a shared sentence would end up
	 * promising Jetzy events to someone buying a concierge service.
	 */
	checkoutBlurb: string
	/**
	 * Stripe product id. Env-overridable so test and live environments differ without a
	 * code change; the fallback is the PRODUCTION id, so a misconfigured non-production
	 * environment fails loudly at `products.retrieve` rather than quietly selling the
	 * wrong thing.
	 */
	productId: string
	/**
	 * OTHER Stripe products that are this same membership — recognised, never sold from here.
	 *
	 * selectmember.jetzy.com sells Full Concierge Annual as a SEPARATE product on the shared Stripe
	 * account, so matching `productId` alone missed every annual member: no Premium for them, a
	 * second Concierge offered on a bundled ticket, and their old Premium never stopped. Both
	 * modes' ids may sit in the list — a test id simply never matches in live, and vice versa.
	 * Extend without a deploy via the `<KEY>` env var named in each entry.
	 */
	alsoProductIds?: string[]
	/** Dot-path prefix of the subscription sub-document on `Users` / `EventUsers`. */
	userField: "premiumSubscription" | "conciergeSubscription"
	/**
	 * The plan identifier selectmember.jetzy.com expects, when this product is theirs.
	 * Absent means "we own this membership outright; nothing to mirror".
	 */
	selectMemberPlan?: string
	/**
	 * SelectMember's plan identifier per billing interval, when it differs from `selectMemberPlan`.
	 * Read through `selectMemberPlanFor` — an interval with no entry falls back to
	 * `selectMemberPlan` and logs, rather than sending them a plan name we invented.
	 */
	selectMemberPlans?: Partial<Record<"month" | "year", string>>
	/**
	 * Other memberships this one ENTITLES its holder to, at no extra charge.
	 *
	 * Full Concierge includes Jetzy Premium (CEO, 2026-10-19): a Concierge member is a Premium
	 * member for every purpose — badge, benefits, and "never sell them Premium again" — while
	 * only Concierge is billed. Nothing is written for the included membership: there is no
	 * Premium subscription and no `premiumSubscription` record behind it. It is DERIVED, every
	 * time, through `expandEntitlements` / `isMembershipEntitled`, which is what makes it end by
	 * itself the moment Concierge does. The mobile backend and selectmember.jetzy.com apply the
	 * same rule against the same collections.
	 */
	includes?: MembershipKey[]
}

export const MEMBERSHIPS: Record<MembershipKey, MembershipDefinition> = {
	premium: {
		key: "premium",
		label: "Jetzy Premium",
		receiptLabel: "Jetzy Premium membership",
		shortLabel: "Premium",
		checkoutBlurb: "Unlock exclusive events & member benefits.",
		productId: process.env.NEXT_STRIPE_PREMIUM_PRODUCT_ID || "prod_Uxn2R9FQd5F3sp",
		userField: "premiumSubscription",
	},
	concierge: {
		key: "concierge",
		label: "Full Concierge Membership",
		receiptLabel: "Full Concierge Membership",
		shortLabel: "Concierge",
		checkoutBlurb: "Priority seating, VIP entrance, complimentary invites and member-only discounts.",
		// Production `prod_UlQTOgXS73TAEV`; staging `prod_UjabUJ9OXWhLPJ` must be supplied
		// through the env var.
		productId: process.env.NEXT_STRIPE_CONCIERGE_PRODUCT_ID || "prod_UlQTOgXS73TAEV",
		// Concierge Annual — test `prod_UlPxrsQgIknFRQ` ($595/year). The live id goes in
		// `NEXT_STRIPE_CONCIERGE_EXTRA_PRODUCT_IDS` (comma-separated) until it is recorded here.
		// Monthly is listed too so an env pointing `productId` at one mode still knows the other.
		alsoProductIds: [
			"prod_UjabUJ9OXWhLPJ",
			"prod_UlQTOgXS73TAEV",
			"prod_UlPxrsQgIknFRQ",
			...String(process.env.NEXT_STRIPE_CONCIERGE_EXTRA_PRODUCT_IDS || "")
				.split(",")
				.map((id) => id.trim())
				.filter(Boolean),
		],
		userField: "conciergeSubscription",
		selectMemberPlan: "select_monthly",
		// The annual plan name is SelectMember's to give — until it is, annual sales mirror as
		// `select_monthly` with a warning (see `selectMemberPlanFor`).
		selectMemberPlans: { month: "select_monthly" },
		includes: ["premium"],
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
	return MEMBERSHIP_KEYS.find((key) => isMembershipProduct(key, productId)) || null
}

/** Every Stripe product that IS this membership: the one we sell, plus `alsoProductIds`. */
export const membershipProductIds = (key: MembershipKey): string[] => {
	const definition = MEMBERSHIPS[key]
	if (!definition) return []
	return Array.from(new Set([definition.productId, ...(definition.alsoProductIds || [])].filter(Boolean)))
}

/** Is this Stripe product one of this membership's? Use for DETECTION; sell from `productId`. */
export const isMembershipProduct = (key: MembershipKey, productId?: string | null): boolean =>
	!!productId && membershipProductIds(key).includes(productId)

/**
 * The memberships a set of HELD memberships entitles someone to: what they hold, plus
 * everything those include. Order-normalised.
 *
 * Use this — never re-derive "Concierge counts as Premium" inline. See `includes`.
 */
export const expandEntitlements = (held: MembershipKey[]): MembershipKey[] => {
	const all = new Set<MembershipKey>(held)
	held.forEach((key) => (MEMBERSHIPS[key]?.includes || []).forEach((included) => all.add(included)))
	return MEMBERSHIP_KEYS.filter((key) => all.has(key))
}

/** The memberships that include `key` (e.g. `premium` → `["concierge"]`). */
export const membershipsIncluding = (key: MembershipKey): MembershipKey[] =>
	MEMBERSHIP_KEYS.filter((other) => (MEMBERSHIPS[other].includes || []).includes(key))

/**
 * Which of a user document's own memberships are ACTIVE — the stored flags, nothing derived.
 * Accepts a lean doc, a mongoose doc, or a projection holding only the `active` flags.
 */
export const activeMembershipsOnDoc = (doc: any): MembershipKey[] =>
	MEMBERSHIP_KEYS.filter((key) => !!doc?.[MEMBERSHIPS[key].userField]?.active)

/**
 * Is this user document entitled to `key`, directly or through a membership that includes it?
 *
 * `isMembershipEntitled(doc, "premium")` is THE answer to "is this person a Premium member".
 * Reading `premiumSubscription.active` alone misses every Concierge member.
 */
export const isMembershipEntitled = (doc: any, key: MembershipKey): boolean =>
	expandEntitlements(activeMembershipsOnDoc(doc)).includes(key)

/**
 * HOW the person holds `key`: through their own subscription to it, through a membership that
 * includes it, or not at all. Their own subscription wins — someone paying for Premium while
 * also holding Concierge is described by the subscription they actually pay for.
 */
export const membershipEntitlementSource = (doc: any, key: MembershipKey): MembershipKey | null => {
	const active = activeMembershipsOnDoc(doc)
	const via = active.find((held) => held !== key && (MEMBERSHIPS[held].includes || []).includes(key)) || null
	if (active.includes(key)) {
		// Their own subscription is ending (typically retired because Concierge now includes it) while
		// another membership keeps it going — describe what actually keeps them Premium, or the card
		// reads "Cancels <date>" to someone who loses nothing on that date.
		const ownEnding = !!doc?.[MEMBERSHIPS[key].userField]?.cancelAtPeriodEnd
		return ownEnding && via ? via : key
	}
	return via
}

/** What a Concierge member is told when something tries to sell them Premium. */
export const PREMIUM_INCLUDED_MESSAGE =
	"Jetzy Premium is already included with your Full Concierge Membership — there's nothing more to buy."

/**
 * The plan name SelectMember expects for this membership at this billing interval, or undefined
 * when the product isn't theirs. Annual Concierge is a separate SelectMember plan; until its name
 * is recorded in `selectMemberPlans`, the base plan is sent and the gap is logged.
 */
export const selectMemberPlanFor = (key: MembershipKey, interval?: string | null): string | undefined => {
	const definition = MEMBERSHIPS[key]
	if (!definition?.selectMemberPlan) return undefined
	const exact = interval === "month" || interval === "year" ? definition.selectMemberPlans?.[interval] : undefined
	if (exact) return exact
	if (interval && interval !== "month") {
		console.warn(`[memberships] No SelectMember plan recorded for ${key} at "${interval}" — sending ${definition.selectMemberPlan}`)
	}
	return definition.selectMemberPlan
}

/** Every SelectMember plan name that means this membership — to recognise one in their status reply. */
export const selectMemberPlanNames = (key: MembershipKey): string[] => {
	const definition = MEMBERSHIPS[key]
	if (!definition?.selectMemberPlan) return []
	return Array.from(new Set([definition.selectMemberPlan, ...Object.values(definition.selectMemberPlans || {})].filter(Boolean) as string[]))
}
