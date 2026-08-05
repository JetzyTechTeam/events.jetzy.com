import Stripe from "stripe"

// Env-overridable so test/live Stripe environments can use different product ids
// without a code change.
export const PREMIUM_PRODUCT_ID = process.env.NEXT_STRIPE_PREMIUM_PRODUCT_ID || "prod_Uxn2R9FQd5F3sp"

let stripeInstance: Stripe | null = null

export function getStripeClient(): Stripe {
	if (!stripeInstance) {
		stripeInstance = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)
	}
	return stripeInstance
}

export type PremiumSubscriptionData = {
	active: boolean
	stripeCustomerId?: string
	stripeSubscriptionId?: string
	status?: string
	currentPeriodEnd?: Date
	cancelAtPeriodEnd?: boolean
}

// Logged-in users are looked up in either the `Users` or `EventUsers` collection
// interchangeably (see [...nextauth].ts) — mirror that dual lookup here so premium
// status can be read/written no matter which collection the account lives in.
export async function findUserRecord(userId: string): Promise<{ model: any; doc: any } | null> {
	const { Users } = await import("@/models/userModal")
	const { EventUsers } = await import("@/models/eventUsersModal")

	let doc = await Users.findById(userId)
	if (doc) return { model: Users, doc }

	doc = await EventUsers.findById(userId)
	if (doc) return { model: EventUsers, doc }

	return null
}

export async function findUserByStripeCustomerId(customerId: string): Promise<{ model: any; doc: any } | null> {
	const { Users } = await import("@/models/userModal")
	const { EventUsers } = await import("@/models/eventUsersModal")

	let doc = await Users.findOne({ "premiumSubscription.stripeCustomerId": customerId })
	if (doc) return { model: Users, doc }

	doc = await EventUsers.findOne({ "premiumSubscription.stripeCustomerId": customerId })
	if (doc) return { model: EventUsers, doc }

	return null
}

/**
 * Does this Stripe customer already have a live Premium subscription?
 *
 * Asks STRIPE rather than our `premiumSubscription.active` copy, which is only written once
 * the webhook lands. Two bundled purchases in quick succession — or any webhook delay —
 * would otherwise each see "not a member yet" and create a second subscription against the
 * same customer. Stripe is the source of truth for billing state; Mongo is a cache.
 *
 * `trialing` counts as active: they are on the plan and will be billed.
 *
 * Returns false on error rather than throwing. A failed lookup must not block a purchase —
 * the worst case is the duplicate this guard exists to catch, which is recoverable, whereas
 * refusing a valid checkout is not.
 */
export async function hasActivePremiumSubscription(customerId: string): Promise<boolean> {
	if (!customerId) return false
	try {
		const stripe = getStripeClient()
		const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })
		return subscriptions.data.some(
			(subscription) =>
				(subscription.status === "active" || subscription.status === "trialing") &&
				subscription.items.data.some((item) => {
					const product = item.price?.product
					return (typeof product === "string" ? product : product?.id) === PREMIUM_PRODUCT_ID
				}),
		)
	} catch (error) {
		console.error("[premium] hasActivePremiumSubscription failed:", error)
		return false
	}
}

/**
 * Who to email about a subscription, resolved from its Stripe customer id.
 *
 * Membership can be acquired as a side effect of buying a ticket, so the person on the
 * other end may not think of themselves as a subscriber at all — which is exactly why
 * every charge, failure and ending has to reach them. Returns null when the customer
 * can't be matched; callers treat that as "skip the email", never as an error worth
 * failing a webhook over.
 */
export async function findEmailRecipientByStripeCustomerId(
	customerId: string,
): Promise<{ email: string; firstName?: string } | null> {
	const record = await findUserByStripeCustomerId(customerId)
	const email = record?.doc?.email
	if (!email) return null
	return { email, firstName: record?.doc?.firstName }
}

export async function setUserPremiumStatus(userId: string, data: Partial<PremiumSubscriptionData>): Promise<void> {
	const record = await findUserRecord(userId)
	if (!record) {
		console.error("[premium] setUserPremiumStatus: user not found", userId)
		return
	}

	const { model, doc } = record
	await model.findByIdAndUpdate(doc._id, {
		$set: Object.fromEntries(
			Object.entries(data).map(([key, value]) => [`premiumSubscription.${key}`, value]),
		),
	})
}

/**
 * The Stripe Price the Premium subscription is sold at.
 *
 * Resolved from the product's `default_price` rather than a stored id, so swapping the plan
 * in the Stripe dashboard needs no deploy. Throws rather than returning null — every caller
 * treats a missing price as fatal.
 */
export async function getPremiumPrice(): Promise<Stripe.Price> {
	const stripe = getStripeClient()
	const product = await stripe.products.retrieve(PREMIUM_PRODUCT_ID, { expand: ["default_price"] })
	const price = product.default_price as Stripe.Price | null
	if (!price) throw new Error("Premium plan has no active default price configured.")
	return price
}

/**
 * Get (or create) the Stripe Customer for a Jetzy user, persisting the id.
 *
 * Persisting matters beyond convenience: `customer.subscription.updated` / `.deleted` and
 * every renewal resolve the user via `premiumSubscription.stripeCustomerId`
 * (`setPremiumStatusByStripeCustomerId`). A subscription created against a customer id that
 * was never written back is unattributable — the user would be billed with no way for the
 * webhook to find them.
 *
 * Shared by `api/subscriptions/checkout.ts` and the bundled-ticket path in `api/checkout`.
 */
export async function resolveStripeCustomerForUser(userId: string, email: string): Promise<string> {
	const record = await findUserRecord(userId)
	if (!record) throw new Error(`resolveStripeCustomerForUser: user not found (${userId})`)

	const { model, doc } = record
	const existing: string | undefined = doc.premiumSubscription?.stripeCustomerId
	if (existing) return existing

	const stripe = getStripeClient()
	const customer = await stripe.customers.create({ email, metadata: { userId: String(userId) } })
	await model.findByIdAndUpdate(doc._id, { $set: { "premiumSubscription.stripeCustomerId": customer.id } })
	return customer.id
}

export async function setPremiumStatusByStripeCustomerId(customerId: string, data: Partial<PremiumSubscriptionData>): Promise<void> {
	const record = await findUserByStripeCustomerId(customerId)
	if (!record) {
		console.error("[premium] setPremiumStatusByStripeCustomerId: no user for customer", customerId)
		return
	}

	const { model, doc } = record
	await model.findByIdAndUpdate(doc._id, {
		$set: Object.fromEntries(
			Object.entries(data).map(([key, value]) => [`premiumSubscription.${key}`, value]),
		),
	})
}
