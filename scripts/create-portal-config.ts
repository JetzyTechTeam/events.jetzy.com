/**
 * Create (or update) the Billing Portal configuration this app opens sessions with.
 *
 *   npx tsx scripts/create-portal-config.ts            # create, print the id
 *   npx tsx scripts/create-portal-config.ts --show     # just show what exists
 *   npx tsx scripts/create-portal-config.ts --update bpc_xxx
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

async function main() {
	const args = process.argv.slice(2)
	const show = args.includes("--show")
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

	const config = updateId
		? await stripe.billingPortal.configurations.update(updateId, { features })
		: await stripe.billingPortal.configurations.create({
				features,
				business_profile: {
					headline: "Jetzy partners with Stripe for simplified billing.",
				},
		  })

	console.log(`${updateId ? "updated" : "created"}: ${config.id}`)
	console.log(`  is_default              = ${config.is_default}   (must be false — we never touch the account default)`)
	console.log(`  subscription_update     = ${(config.features as any).subscription_update?.enabled}`)
	console.log(`  subscription_cancel     = ${(config.features as any).subscription_cancel?.enabled} (${(config.features as any).subscription_cancel?.mode})`)
	console.log(`\nSet this in the environment:\n  STRIPE_PORTAL_CONFIG_ID=${config.id}`)
}

main().catch((e) => {
	console.error(e?.message || e)
	process.exit(1)
})
