import Stripe from "stripe"
import { MEMBERSHIPS, MEMBERSHIP_KEYS, isMembershipKey, membershipKeyForProductId, type MembershipKey } from "@/lib/memberships"

/**
 * Stripe + Mongo plumbing for MEMBERSHIPS — plural.
 *
 * Every function here is keyed by `MembershipKey`. It used to be hardcoded to Jetzy Premium,
 * which was survivable while that was the only product; with Full Concierge alongside it, an
 * unkeyed write is a live billing hazard (a Concierge purchase overwriting a Premium record,
 * a Concierge cancellation revoking Premium). See `src/lib/memberships.ts`.
 */

/** @deprecated Use `MEMBERSHIPS.premium.productId`. Kept for `api/subscriptions/plan.ts`. */
export const PREMIUM_PRODUCT_ID = MEMBERSHIPS.premium.productId

let stripeInstance: Stripe | null = null

export function getStripeClient(): Stripe {
	if (!stripeInstance) {
		stripeInstance = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)
	}
	return stripeInstance
}

export type MembershipSubscriptionData = {
	active: boolean
	stripeCustomerId?: string
	stripeSubscriptionId?: string
	status?: string
	currentPeriodEnd?: Date
	cancelAtPeriodEnd?: boolean
}

/** @deprecated Name kept for readability at the Premium-only call sites. */
export type PremiumSubscriptionData = MembershipSubscriptionData

// Logged-in users are looked up in either the `Users` or `EventUsers` collection
// interchangeably (see [...nextauth].ts) — mirror that dual lookup here so membership
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

/**
 * The user's Stripe Customer id, wherever it happens to be stored.
 *
 * A Stripe Customer is a BILLING IDENTITY, not a membership: one customer holds every
 * subscription that person has. It now lives at the user root, but for everyone who
 * subscribed before that it only exists inside `premiumSubscription`. Both are read, so no
 * backfill migration is needed.
 */
export const getUserStripeCustomerId = (doc: any): string | undefined =>
	doc?.stripeCustomerId ||
	doc?.premiumSubscription?.stripeCustomerId ||
	doc?.conciergeSubscription?.stripeCustomerId ||
	undefined

/** Escape a user-supplied string for safe use inside a RegExp — same reason as booking-identity.ts. */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Last resort when a Stripe Customer isn't linked to anyone yet: ask Stripe for the
 * customer's email and match it against our accounts.
 *
 * This is the NORMAL case for a subscription created outside this app — selectmember.jetzy.com
 * sells Jetzy Premium against the same Stripe account, and the customer it creates has never
 * paid us, so no document carries that id. Without this the webhook fires, finds nobody, and
 * the member is charged while their membership never activates.
 *
 * It PERSISTS the link on success, which is the point. `customer.subscription.updated` writes
 * only the membership sub-document — not the customer id — so nothing else would ever record
 * it: the lookup would fall back to Stripe on every future event, and `getUserStripeCustomerId`
 * would still return nothing, leaving the member unable to open the billing portal.
 *
 * Email matching is inherently weaker than an id: whoever creates the Stripe Customer must put
 * the address the person signed up with. A mismatch attaches the subscription to the wrong
 * account rather than to none, so both outcomes are logged loudly.
 */
async function linkStripeCustomerByEmail(customerId: string): Promise<{ model: any; doc: any } | null> {
	if (!customerId) return null

	let email: string | undefined
	try {
		const customer = await getStripeClient().customers.retrieve(customerId)
		// A deleted customer has no email and nothing worth linking.
		if ((customer as Stripe.DeletedCustomer).deleted) return null
		email = (customer as Stripe.Customer).email?.trim() || undefined
	} catch (error: any) {
		// Never throw from here — this runs inside webhook handlers, and a Stripe blip must not
		// turn into a failed delivery that Stripe then retries.
		console.error("[membership] Could not retrieve Stripe customer for email fallback:", customerId, error?.message || error)
		return null
	}

	if (!email) {
		console.warn("[membership] Stripe customer has no email, cannot link:", customerId)
		return null
	}

	const { Users } = await import("@/models/userModal")
	const { EventUsers } = await import("@/models/eventUsersModal")

	// Case-insensitive by necessity: neither collection declares `lowercase: true` on `email`,
	// so someone who signed up as `Fahad@Example.com` is invisible to an exact match. Both
	// collections, because an account created through this app's own auth flow lives in
	// `EventUsers` and is just as billing-capable.
	const match = { email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } }
	let model: any = Users
	let doc = await Users.findOne(match)
	if (!doc) {
		model = EventUsers
		doc = await EventUsers.findOne(match)
	}

	if (!doc) {
		console.warn("[membership] No Jetzy account matches Stripe customer email — membership cannot activate:", { customerId, email })
		return null
	}

	const existing = doc.stripeCustomerId
	if (!existing) {
		await model.findByIdAndUpdate(doc._id, { $set: { stripeCustomerId: customerId } })
		doc.stripeCustomerId = customerId
		console.log("[membership] Linked Stripe customer to account by email:", { customerId, email })
	} else if (existing !== customerId) {
		// Two Stripe Customers for one person. Deliberately NOT overwritten — the stored id
		// belongs to their other subscription, and replacing it would orphan that one's future
		// events. Surfaced so the duplicate can be merged in Stripe.
		console.warn("[membership] Account already has a different Stripe customer; not overwriting:", {
			email,
			stored: existing,
			incoming: customerId,
		})
	}

	return { model, doc }
}

export async function findUserByStripeCustomerId(customerId: string): Promise<{ model: any; doc: any } | null> {
	const { Users } = await import("@/models/userModal")
	const { EventUsers } = await import("@/models/eventUsersModal")

	// The root field is the new home; the two sub-document paths keep pre-existing members
	// resolvable. Missing any of them would orphan a live subscription — the webhook would
	// have no user to attribute a renewal or a cancellation to.
	const query = {
		$or: [
			{ stripeCustomerId: customerId },
			...MEMBERSHIP_KEYS.map((key) => ({ [`${MEMBERSHIPS[key].userField}.stripeCustomerId`]: customerId })),
		],
	}

	let doc = await Users.findOne(query)
	if (doc) return { model: Users, doc }

	doc = await EventUsers.findOne(query)
	if (doc) return { model: EventUsers, doc }

	// Nothing carries this id. Either it is a customer we created and never linked, or one
	// created by another Jetzy surface against the shared Stripe account.
	return (await linkStripeCustomerByMetadata(customerId)) || linkStripeCustomerByEmail(customerId)
}

/**
 * The Jetzy user id stamped on the Stripe Customer itself.
 *
 * We have always written `metadata.userId` when creating a Customer (`resolveStripeCustomerForUser`)
 * but never read it back. selectmember.jetzy.com now stamps the same field — on the customer and
 * on the subscription — including a backfill for customers that predate it.
 *
 * Preferred over the email fallback below because it is an ID match: two accounts sharing an
 * address, or a Stripe Customer whose email differs from the Jetzy account's, both attach a
 * subscription to the wrong person under email matching and cannot under this.
 *
 * Like the email path, it persists the link so it only runs once per member, and never throws —
 * this is reached from webhook handlers, where an exception becomes a failed delivery that
 * Stripe then retries.
 */
async function linkStripeCustomerByMetadata(customerId: string): Promise<{ model: any; doc: any } | null> {
	if (!customerId) return null

	let userId: string | undefined
	try {
		const customer = await getStripeClient().customers.retrieve(customerId)
		if ((customer as Stripe.DeletedCustomer).deleted) return null
		userId = (customer as Stripe.Customer).metadata?.userId?.trim() || undefined
	} catch (error: any) {
		console.error("[membership] Could not retrieve Stripe customer for metadata lookup:", customerId, error?.message || error)
		return null
	}

	if (!userId) return null

	// `findUserRecord` searches both collections by _id, so an EventUsers account resolves too.
	const record = await findUserRecord(userId).catch(() => null)
	if (!record) {
		console.warn("[membership] Stripe customer metadata.userId matches no account:", { customerId, userId })
		return null
	}

	const existing = record.doc.stripeCustomerId
	if (!existing) {
		await record.model.findByIdAndUpdate(record.doc._id, { $set: { stripeCustomerId: customerId } })
		record.doc.stripeCustomerId = customerId
		console.log("[membership] Linked Stripe customer to account by metadata.userId:", { customerId, userId })
	} else if (existing !== customerId) {
		// Two Stripe Customers for one person. Not overwritten — the stored id belongs to their
		// other subscription and replacing it would orphan that one's future events.
		console.warn("[membership] Account already has a different Stripe customer; not overwriting:", {
			userId,
			stored: existing,
			incoming: customerId,
		})
	}

	return record
}

/**
 * Which membership product is this Stripe subscription for?
 *
 * `metadata.membershipKey` is stamped on everything we create and is checked first, because
 * it survives a product id being swapped in the dashboard. The line-item product is the
 * fallback for subscriptions created before that metadata existed.
 *
 * Returns null for a product we don't recognise. Callers MUST treat that as "leave it alone",
 * never as "assume Premium" — the whole reason this function exists is that assuming Premium
 * is how a Concierge subscription would silently clobber a Premium record.
 */
export function subscriptionMembershipKey(subscription: Stripe.Subscription): MembershipKey | null {
	const fromMetadata = (subscription.metadata as any)?.membershipKey
	if (isMembershipKey(fromMetadata)) return fromMetadata

	for (const item of subscription.items?.data || []) {
		const product = item.price?.product
		const productId = typeof product === "string" ? product : product?.id
		const key = membershipKeyForProductId(productId)
		if (key) return key
	}

	return null
}

/**
 * Does this Stripe customer already have a live subscription to THIS product?
 *
 * Asks STRIPE rather than our `active` copy, which is only written once the webhook lands.
 * Two bundled purchases in quick succession — or any webhook delay — would otherwise each see
 * "not a member yet" and create a second subscription against the same customer. Stripe is the
 * source of truth for billing state; Mongo is a cache.
 *
 * `trialing` counts as active: they are on the plan and will be billed. (Every membership we
 * create starts in a trial that covers the period already paid for at checkout, so excluding
 * it would make every fresh member look unsubscribed.)
 *
 * Returns false on error rather than throwing. A failed lookup must not block a purchase —
 * the worst case is the duplicate this guard exists to catch, which is recoverable, whereas
 * refusing a valid checkout is not.
 */
export async function hasActiveMembershipSubscription(customerId: string, key: MembershipKey): Promise<boolean> {
	if (!customerId) return false
	const productId = MEMBERSHIPS[key]?.productId
	if (!productId) return false
	try {
		const stripe = getStripeClient()
		const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })
		return subscriptions.data.some(
			(subscription) =>
				(subscription.status === "active" || subscription.status === "trialing") &&
				subscription.items.data.some((item) => {
					const product = item.price?.product
					return (typeof product === "string" ? product : product?.id) === productId
				}),
		)
	} catch (error) {
		console.error(`[membership] hasActiveMembershipSubscription(${key}) failed:`, error)
		return false
	}
}

/**
 * Has this customer EVER held this membership — including subscriptions long since cancelled?
 *
 * `hasActiveMembershipSubscription` answers "are they a member right now", which is the wrong
 * question for a first-timer offer: someone who subscribed, cancelled, and came back is not new,
 * and Stripe enforces nothing of the sort on its own. A trial code has to be refused on
 * HISTORY, not on current state.
 *
 * Fails OPEN on a Stripe error (returns false, i.e. "no history"). The alternative is refusing
 * a legitimate buyer their offer because a third-party call timed out; the downside is a
 * duplicate trial in that window, which is a marketing cost, not a billing incident.
 */
export async function hasEverHadMembership(customerId: string, key: MembershipKey): Promise<boolean> {
	if (!customerId) return false
	const productId = MEMBERSHIPS[key]?.productId
	if (!productId) return false
	try {
		const stripe = getStripeClient()
		const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })
		return subscriptions.data.some((subscription) =>
			subscription.items.data.some((item) => {
				const product = item.price?.product
				return (typeof product === "string" ? product : product?.id) === productId
			}),
		)
	} catch (error) {
		console.error(`[membership] hasEverHadMembership(${key}) failed:`, error)
		return false
	}
}

/**
 * The live subscription id for a product on this customer, if any.
 *
 * Used by the inbound SelectMember cancel webhook, which must cancel the CONCIERGE
 * subscription and leave any Premium one alone.
 */
export async function findActiveSubscriptionForProduct(customerId: string, key: MembershipKey): Promise<Stripe.Subscription | null> {
	if (!customerId) return null
	const productId = MEMBERSHIPS[key]?.productId
	if (!productId) return null
	try {
		const stripe = getStripeClient()
		const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })
		return (
			subscriptions.data.find(
				(subscription) =>
					(subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due") &&
					subscription.items.data.some((item) => {
						const product = item.price?.product
						return (typeof product === "string" ? product : product?.id) === productId
					}),
			) || null
		)
	} catch (error) {
		console.error(`[membership] findActiveSubscriptionForProduct(${key}) failed:`, error)
		return null
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

const membershipUpdate = (key: MembershipKey, data: Partial<MembershipSubscriptionData>) => {
	const field = MEMBERSHIPS[key].userField
	return {
		$set: {
			...Object.fromEntries(Object.entries(data).map(([k, value]) => [`${field}.${k}`, value])),
			// Keep the billing identity at the root in step. Harmless to re-write; it is the
			// same customer every time for a given user.
			...(data.stripeCustomerId ? { stripeCustomerId: data.stripeCustomerId } : {}),
		},
	}
}

export async function setUserMembershipStatus(
	userId: string,
	key: MembershipKey,
	data: Partial<MembershipSubscriptionData>,
): Promise<void> {
	const record = await findUserRecord(userId)
	if (!record) {
		console.error(`[membership] setUserMembershipStatus(${key}): user not found`, userId)
		return
	}

	const { model, doc } = record
	await model.findByIdAndUpdate(doc._id, membershipUpdate(key, data))
}

export async function setMembershipStatusByStripeCustomerId(
	customerId: string,
	key: MembershipKey,
	data: Partial<MembershipSubscriptionData>,
): Promise<void> {
	const record = await findUserByStripeCustomerId(customerId)
	if (!record) {
		console.error(`[membership] setMembershipStatusByStripeCustomerId(${key}): no user for customer`, customerId)
		return
	}

	const { model, doc } = record
	await model.findByIdAndUpdate(doc._id, membershipUpdate(key, data))
}

/**
 * The Stripe Price a membership is sold at.
 *
 * Resolved from the product's `default_price` rather than a stored id, so swapping the plan
 * in the Stripe dashboard needs no deploy. Throws rather than returning null — every caller
 * treats a missing price as fatal.
 */
export async function getMembershipPrice(key: MembershipKey): Promise<Stripe.Price> {
	const definition = MEMBERSHIPS[key]
	if (!definition) throw new Error(`Unknown membership: ${key}`)

	const stripe = getStripeClient()
	const product = await stripe.products.retrieve(definition.productId, { expand: ["default_price"] })
	const price = product.default_price as Stripe.Price | null
	if (!price) throw new Error(`${definition.label} has no active default price configured.`)
	return price
}

/**
 * The price a membership is sold at for ONE specific billing interval.
 *
 * Jetzy Premium is sold monthly ($20) and annually ($200) as two prices on the SAME product —
 * never two products, because every eligibility check here and on selectmember.jetzy.com
 * resolves by product id, and a separate product is invisible to all of them.
 *
 * Returns null when the product isn't sold at that interval, rather than quietly substituting
 * the default. The two callers need opposite things from that case and only they can decide:
 *
 *   - direct checkout — a buyer who chose Annual must NOT be silently charged monthly, so a
 *     null is an error the buyer sees.
 *   - a bundled ticket — a host who set the ticket to annual meant Premium; Full Concierge has
 *     no annual price, so falling back to its default is right. The line carries whatever price
 *     was actually resolved, so the recurring disclosure stays truthful either way.
 */
export async function findMembershipPriceForInterval(key: MembershipKey, interval: string): Promise<Stripe.Price | null> {
	const definition = MEMBERSHIPS[key]
	if (!definition || !interval) return null

	try {
		const stripe = getStripeClient()
		const product = await stripe.products.retrieve(definition.productId, { expand: ["default_price"] })
		const defaultPriceId = (product.default_price as Stripe.Price | null)?.id

		const prices = await stripe.prices.list({ product: definition.productId, active: true, limit: 100 })
		const matches = prices.data.filter((price) => price.recurring?.interval === interval && price.unit_amount != null)
		if (matches.length === 0) return null

		// The product's DEFAULT wins its own interval. Premium still has a legacy $10/month price
		// active alongside the current $20 one, so "the first monthly price" is not a safe answer
		// to "what does monthly cost" — it could charge half. Stripe lists newest first, so among
		// non-defaults the first is the most recent, which is the right guess for the current rate.
		return matches.find((price) => price.id === defaultPriceId) || matches[0]
	} catch (error: any) {
		console.error(`[membership] Could not resolve the ${interval} price for ${key}:`, error?.message || error)
		return null
	}
}

/**
 * Get (or create) the Stripe Customer for a Jetzy user, persisting the id.
 *
 * Persisting matters beyond convenience: `customer.subscription.updated` / `.deleted` and
 * every renewal resolve the user by customer id (`findUserByStripeCustomerId`). A subscription
 * created against a customer id that was never written back is unattributable — the user would
 * be billed with no way for the webhook to find them.
 *
 * ONE customer per user, holding BOTH memberships. That is deliberate: it is what lets the
 * Stripe billing portal show a member every subscription they have with one link, and what
 * makes `hasActiveMembershipSubscription` able to see a plan bought through a different flow.
 * It is also precisely why every write is product-keyed.
 */
export async function resolveStripeCustomerForUser(userId: string, email: string): Promise<string> {
	const record = await findUserRecord(userId)
	if (!record) throw new Error(`resolveStripeCustomerForUser: user not found (${userId})`)

	const { model, doc } = record
	const existing = getUserStripeCustomerId(doc)
	if (existing) {
		// Lift a legacy id out of `premiumSubscription` into the root field so later lookups
		// don't depend on which product happened to be bought first.
		if (!doc.stripeCustomerId) {
			await model.findByIdAndUpdate(doc._id, { $set: { stripeCustomerId: existing } })
		}
		return existing
	}

	const stripe = getStripeClient()
	const customer = await stripe.customers.create({ email, metadata: { userId: String(userId) } })
	await model.findByIdAndUpdate(doc._id, { $set: { stripeCustomerId: customer.id } })
	return customer.id
}
