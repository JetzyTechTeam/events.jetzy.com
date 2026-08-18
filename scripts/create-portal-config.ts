/**
 * Create (or update) the Billing Portal configurations this app opens sessions with.
 *
 *   npx tsx scripts/create-portal-config.ts            # the default one — no plan switching
 *   npx tsx scripts/create-portal-config.ts --switch   # the Premium-only switch flow
 *   npx tsx scripts/create-portal-config.ts --show     # just show what exists
 *   npx tsx scripts/create-portal-config.ts --update bpc_xxx      [--switch]
 *
 * WHY THIS EXISTS
 *
 * `/api/subscriptions/portal` used to create sessions with no `configuration`, so Stripe fell
 * through to the ACCOUNT DEFAULT — which has plan switching enabled. One Stripe Customer holds
 * every membership a person has, so a member with Jetzy Premium and Full Concierge was offered
 * "Update subscription" on the Concierge one too. Changing a Select plan there bypasses
 * selectmember.jetzy.com's upgrade rules, proration preview and upgrade email, and because
 * apis-service's Stripe webhooks are disabled the change never reaches Mongo at all.
 *
 * So we stop relying on the default and pass our own configuration, with switching OFF.
 *
 * Deliberately does NOT touch the account default: selectmember.jetzy.com relies on it, and
 * editing a shared object to fix our own surface is the wrong blast radius.
 *
 * Cancellation stays ON for every product. A member must always be able to stop paying, and a
 * Concierge cancellation made here is mirrored back to them by `mirrorToSelectMember` in the
 * Stripe webhook.
 *
 * Run once per environment — the test and live configurations are separate objects with
 * separate ids. Put the printed id in `STRIPE_PORTAL_CONFIG_ID`.
 *
 * --switch: THE SECOND CONFIGURATION
 *
 * A member on monthly Jetzy Premium can move to annual, and the portal is where that happens —
 * Stripe handles the proration, the confirmation screen and the invoice. But switching must be
 * offered on JETZY PREMIUM ONLY, which is why it can't simply be turned back on above: one
 * Stripe Customer holds every membership, so an unscoped `subscription_update` puts an Update
 * button on the Full Concierge row as well, which is the exact defect the first configuration
 * exists to close.
 *
 * Two locks, deliberately overlapping. This configuration lists only the Premium product and
 * its two prices, and `/api/subscriptions/portal` opens it with `flow_data` pinned to the
 * member's own Premium subscription. Either alone would be enough today; together they mean a
 * future edit to one can't quietly expose Concierge.
 *
 * Prices are read from Stripe at run time rather than hardcoded — the ids differ between test
 * and live, and Premium still carries a legacy active $10/month price that must never be
 * offered as a switch target. Put the printed id in `STRIPE_PORTAL_SWITCH_CONFIG_ID`.
 */
import path from "path"
import dotenv from "dotenv"

dotenv.config({ path: path.join(process.cwd(), ".env.local") })
dotenv.config({ path: path.join(process.cwd(), ".env") })

import Stripe from "stripe"

const features = {
	// The whole point: no plan switching from our portal, on any product.
	subscription_update: { enabled: false as const },
	subscription_cancel: {
		enabled: true,
		// Never immediate. The member has paid for the current period and this system issues
		// no refunds, so cutting access early would take something they are owed.
		mode: "at_period_end" as const,
		proration_behavior: "none" as const,
	},
	payment_method_update: { enabled: true },
	invoice_history: { enabled: true },
	customer_update: { enabled: true, allowed_updates: ["email" as const, "address" as const] },
}

/**
 * Premium's active prices, at most one per interval, newest first with the product default
 * winning its own interval.
 *
 * The same rule as `findMembershipPriceForInterval` and `/api/subscriptions/plan`, and for the
 * same reason: "the first monthly price" would offer the legacy $10/month rate, halving what a
 * switching member pays.
 */
async function premiumSwitchPrices(stripe: Stripe) {
	const { MEMBERSHIPS } = await import("@/lib/memberships")
	const productId = MEMBERSHIPS.premium.productId

	const product = await stripe.products.retrieve(productId, { expand: ["default_price"] })
	const defaultPriceId = (product.default_price as Stripe.Price | null)?.id

	const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 })
	const byInterval = new Map<string, Stripe.Price>()
	prices.data.forEach((price) => {
		const interval = price.recurring?.interval
		if (!interval || price.unit_amount == null) return
		const existing = byInterval.get(interval)
		if (!existing || price.id === defaultPriceId) byInterval.set(interval, price)
	})

	const chosen = [...byInterval.values()]
	if (chosen.length < 2) {
		throw new Error(
			`${product.name} has ${chosen.length} interval(s) on sale — a switch flow needs at least two. ` +
				`Nothing was created.`,
		)
	}
	return { productId, productName: product.name, prices: chosen }
}

async function main() {
	const args = process.argv.slice(2)
	const show = args.includes("--show")
	const isSwitch = args.includes("--switch")
	const updateIdx = args.indexOf("--update")
	const updateId = updateIdx >= 0 ? args[updateIdx + 1] : undefined

	const key = process.env.NEXT_STRIPE_SECRET_KEY as string
	if (!key) throw new Error("NEXT_STRIPE_SECRET_KEY is not set")
	const stripe = new Stripe(key)
	console.log(`mode: ${key.startsWith("sk_live") ? "LIVE" : "TEST"}\n`)

	if (show) {
		const list = await stripe.billingPortal.configurations.list({ limit: 20 })
		list.data.forEach((c) => {
			const f: any = c.features
			console.log(`${c.id}  default=${c.is_default}  active=${c.active}  name=${(c as any).name || "—"}`)
			console.log(`    subscription_update.enabled = ${f.subscription_update?.enabled}`)
			console.log(`    subscription_cancel = ${f.subscription_cancel?.enabled} (${f.subscription_cancel?.mode})`)
		})
		return
	}

	// Matches the account default's headline exactly. The ONLY difference a member should
	// notice between the old portal and this one is the missing "Update subscription" button;
	// a different headline would read as a different company's billing page.
	const business_profile = { headline: "Travel the world with us." }

	let params: Stripe.BillingPortal.ConfigurationCreateParams = { features, business_profile }
	let scopeSummary = ""

	if (isSwitch) {
		const { productId, productName, prices } = await premiumSwitchPrices(stripe)
		console.log(`switch targets on ${productName} (${productId}):`)
		prices.forEach((p) => console.log(`  ${p.id}  ${(p.unit_amount as number) / 100} / ${p.recurring?.interval}`))
		console.log()

		scopeSummary = `${productId} [${prices.map((p) => p.id).join(", ")}]`
		params = {
			business_profile,
			features: {
				...features,
				subscription_update: {
					enabled: true,
					// Price only. Quantity would let a member buy two memberships, which means
					// nothing here, and `promotion_code` is not something to hand out unattended.
					default_allowed_updates: ["price"],
					// Charge the difference now rather than letting it drift onto a later invoice —
					// this is the same behaviour selectmember.jetzy.com's own configuration uses,
					// and an upgrade that appears free until next month invites a chargeback.
					proration_behavior: "always_invoice",
					// The scope. Only this product, only these prices.
					products: [{ product: productId, prices: prices.map((p) => p.id) }],
				},
			},
		}
	}

	const config = updateId
		? await stripe.billingPortal.configurations.update(updateId, params as Stripe.BillingPortal.ConfigurationUpdateParams)
		: await stripe.billingPortal.configurations.create(params)

	const f: any = config.features
	console.log(`${updateId ? "updated" : "created"}: ${config.id}`)
	console.log(`  is_default              = ${config.is_default}   (must be false — we never touch the account default)`)
	console.log(`  subscription_update     = ${f.subscription_update?.enabled}`)
	if (f.subscription_update?.enabled) {
		console.log(`  proration               = ${f.subscription_update.proration_behavior}`)
		// The pinned API version (2024-04-10) does not echo `subscription_update.products` in the
		// response, so there is nothing to read back — but it IS applied and validated: Stripe
		// rejects an unknown product id, and rejects a price belonging to a different product.
		// Print what we SENT rather than an empty field that reads like the scope was dropped.
		console.log(`  update scope (sent)     = ${scopeSummary || "ALL PRODUCTS — this configuration is not scoped"}`)
	}
	console.log(`  subscription_cancel     = ${f.subscription_cancel?.enabled} (${f.subscription_cancel?.mode})`)
	console.log(
		`\nSet this in the environment:\n  ${isSwitch ? "STRIPE_PORTAL_SWITCH_CONFIG_ID" : "STRIPE_PORTAL_CONFIG_ID"}=${config.id}`,
	)
}

main().catch((e) => {
	console.error(e?.message || e)
	process.exit(1)
})
