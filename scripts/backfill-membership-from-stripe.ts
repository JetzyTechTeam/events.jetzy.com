/**
 * Repair a membership record that Stripe knows about and our database doesn't.
 *
 *   npx tsx scripts/backfill-membership-from-stripe.ts --email someone@example.com --dry-run
 *   npx tsx scripts/backfill-membership-from-stripe.ts --email someone@example.com
 *   npx tsx scripts/backfill-membership-from-stripe.ts --all --dry-run
 *
 * WHY THIS EXISTS
 *
 * A membership sold by ANOTHER Jetzy surface against the shared Stripe account — today that
 * means Jetzy Premium bought on selectmember.jetzy.com — arrives at our webhook as a Checkout
 * Session carrying none of our metadata. Until the webhook learned to read the ids stamped on
 * the Stripe objects, those purchases resolved to no user at all: the subscription billed, and
 * this portal went on offering "Buy Jetzy Premium" to someone already paying for it.
 *
 * The webhook fix stops it happening again. It does nothing for subscriptions already sold,
 * because the only event that would re-attribute them is a renewal or a change, which may be a
 * month away. This script closes that window.
 *
 * STRIPE IS THE AUTHORITY on billing state; Mongo is a cache. So this only ever copies Stripe →
 * Mongo, and only for subscriptions Stripe reports as `active` or `trialing`.
 *
 * Always run with --dry-run first.
 */

import dotenv from "dotenv"
import path from "path"
import Stripe from "stripe"
import mongoose from "mongoose"

dotenv.config({ path: path.join(process.cwd(), ".env.local") })
dotenv.config({ path: path.join(process.cwd(), ".env") })

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
	const index = args.indexOf(`--${name}`)
	return index >= 0 ? args[index + 1] : undefined
}
const has = (name: string) => args.includes(`--${name}`)

const EMAIL = flag("email")
const ALL = has("all")
const DRY_RUN = has("dry-run")

async function main() {
	if (!EMAIL && !ALL) {
		console.error("Pass --email <address> or --all. Add --dry-run to see what would change.")
		process.exit(1)
	}

	const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)
	const { MEMBERSHIPS, MEMBERSHIP_KEYS } = await import("@/lib/memberships")
	const { subscriptionMembershipKey, findUserByStripeCustomerId, setUserMembershipStatus } = await import("@/lib/premium")

	// The app's own connector, not a bare `mongoose.connect` — the models are compiled against
	// it and `bufferCommands` is off, so a second connection leaves every query unrunnable.
	const { ensureDbConnected } = await import("@/configs/database")
	await ensureDbConnected()
	console.log(`stripe=${(process.env.NEXT_STRIPE_SECRET_KEY || "").slice(0, 8)} db=${(process.env.NEXT_EVENTS_DB_URL || "").split("@")[1]?.split("/")[0]}`)
	console.log(DRY_RUN ? "DRY RUN — nothing will be written\n" : "WRITING\n")

	// Active subscriptions, either for one address or across the account.
	const subscriptions: Stripe.Subscription[] = []
	if (EMAIL) {
		const customers = await stripe.customers.list({ email: EMAIL, limit: 100 })
		for (const customer of customers.data) {
			const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })
			subscriptions.push(...subs.data)
		}
	} else {
		for await (const sub of stripe.subscriptions.list({ status: "active", limit: 100 })) {
			subscriptions.push(sub as Stripe.Subscription)
		}
	}

	let repaired = 0
	let alreadyCorrect = 0
	let unresolved = 0

	for (const subscription of subscriptions) {
		const live = subscription.status === "active" || subscription.status === "trialing"
		if (!live) continue

		// An unrecognised product is left strictly alone — writing without knowing WHICH
		// membership is how a Concierge subscription would overwrite someone's Premium record.
		const key = subscriptionMembershipKey(subscription)
		if (!key) continue

		const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
		const subscriptionUserId = (subscription.metadata || {}).userId
		const record = subscriptionUserId ? null : await findUserByStripeCustomerId(customerId)
		const userId = subscriptionUserId || record?.doc?._id?.toString()

		if (!userId) {
			console.log(`UNRESOLVED  ${subscription.id} ${MEMBERSHIPS[key].label} customer=${customerId} — no user id on the subscription, the customer, or by email`)
			unresolved += 1
			continue
		}

		// What does our copy say right now?
		const { Users } = await import("@/models/userModal")
		const { EventUsers } = await import("@/models/eventUsersModal")
		const field = MEMBERSHIPS[key].userField
		const existing =
			(await Users.findById(userId).select(`email ${field}`).lean()) ||
			(await EventUsers.findById(userId).select(`email ${field}`).lean())
		const isActiveHere = !!(existing as any)?.[field]?.active

		if (isActiveHere) {
			alreadyCorrect += 1
			continue
		}

		console.log(
			`REPAIR      ${subscription.id} ${MEMBERSHIPS[key].label} status=${subscription.status} → user ${userId} (${(existing as any)?.email || "unknown email"})`,
		)
		repaired += 1

		if (!DRY_RUN) {
			await setUserMembershipStatus(userId, key, {
				active: true,
				stripeCustomerId: customerId,
				stripeSubscriptionId: subscription.id,
				status: subscription.status,
				currentPeriodEnd: new Date(subscription.current_period_end * 1000),
				cancelAtPeriodEnd: subscription.cancel_at_period_end,
			})
		}
	}

	console.log(
		`\nscanned=${subscriptions.length} repaired=${repaired} already-correct=${alreadyCorrect} unresolved=${unresolved}` +
			(MEMBERSHIP_KEYS.length ? "" : ""),
	)
	await mongoose.disconnect()
}

main().catch((error) => {
	console.error("FAILED:", error?.message || error)
	process.exit(1)
})
