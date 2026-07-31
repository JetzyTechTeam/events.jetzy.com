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
