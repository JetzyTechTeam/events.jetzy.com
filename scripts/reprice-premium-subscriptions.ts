/**
 * Move existing Jetzy Premium members onto the CURRENT price, from their next renewal.
 *
 *   npx tsx scripts/reprice-premium-subscriptions.ts                         # dry run (default)
 *   npx tsx scripts/reprice-premium-subscriptions.ts --subscription sub_xxx  # dry run, one
 *   npx tsx scripts/reprice-premium-subscriptions.ts --apply --subscription sub_xxx
 *   npx tsx scripts/reprice-premium-subscriptions.ts --apply [--limit N]
 *
 * WHY THIS EXISTS
 *
 * Premium was repriced on 2026-09-18 ($20/mo → $10/mo, $200/yr → $100/yr) by pointing the
 * product's default at a different price and archiving the old ones. A price change never moves
 * an existing subscription, so everyone already paying stayed on the old rate. The decision
 * (CEO) is that they pay the new price FROM THEIR NEXT PAYMENT.
 *
 * WHAT IT DOES
 *
 * Swaps the subscription item's price with `proration_behavior: "none"`: no invoice now, no
 * credit, the period already paid for runs out untouched, and the next invoice is at the new
 * rate. No refund is involved, in line with the no-refunds rule.
 *
 * It stamps `metadata.repricedFrom` with the old price id. The webhook reads that twice:
 *   - `customer.subscription.updated` recognises the swap as ours and sends NOTHING, and
 *   - the first `invoice.paid` renewal that actually charges the new rate adds a "we've lowered
 *     the price — you paid $10 instead of $20" line to the renewal email, then sets
 *     `repriceAnnounced` so it is said once.
 * So a member is told only once real money has moved at the new price. Cancel or fail first
 * and they hear nothing about a price they never paid.
 *
 * WHO IS MOVED
 *
 * Only `active` and `trialing` subscriptions on a Premium price that is not the current price
 * for their interval. Skipped and reported: cancelling at period end (no next payment),
 * `past_due` / `unpaid` (their open invoice is already at the old rate), anything with more
 * than one item. Already on the target price = skipped, so a re-run is a no-op.
 *
 * Target prices come from `findMembershipPriceForInterval`, the same resolver checkout uses —
 * no price ids here, so this runs unchanged in test and live. For live, pass the live key AND
 * the live product inline (`.env` holds test values; dotenv never overrides a set variable):
 *
 *   NEXT_STRIPE_SECRET_KEY=sk_live_… NEXT_STRIPE_PREMIUM_PRODUCT_ID=prod_UzMR33CL777c3R \
 *     npx tsx scripts/reprice-premium-subscriptions.ts
 *
 * Always dry-run first.
 */

import dotenv from "dotenv"
import path from "path"
import Stripe from "stripe"

dotenv.config({ path: path.join(process.cwd(), ".env.local") })
dotenv.config({ path: path.join(process.cwd(), ".env") })

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
	const index = args.indexOf(`--${name}`)
	return index >= 0 ? args[index + 1] : undefined
}
const has = (name: string) => args.includes(`--${name}`)

const APPLY = has("apply")
const ONLY = flag("subscription")
const LIMIT = flag("limit") ? Number(flag("limit")) : Infinity

const MOVABLE = new Set(["active", "trialing"])

const dollars = (cents: number | null | undefined) => (cents == null ? "?" : `$${(cents / 100).toFixed(2)}`)
const day = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : "?")

async function main() {
	const key = process.env.NEXT_STRIPE_SECRET_KEY
	if (!key) throw new Error("NEXT_STRIPE_SECRET_KEY is not set")
	if (!Number.isFinite(LIMIT) && flag("limit")) throw new Error("--limit must be a number")

	const stripe = new Stripe(key)
	const { MEMBERSHIPS } = await import("@/lib/memberships")
	const { findMembershipPriceForInterval } = await import("@/lib/premium")
	const productId = MEMBERSHIPS.premium.productId

	console.log(`mode: ${key.startsWith("sk_live_") ? "LIVE" : "TEST"}`)
	console.log(`product: ${productId}`)
	console.log(APPLY ? "APPLYING — subscriptions will be updated\n" : "DRY RUN — nothing will be written\n")

	// The price each interval should be on now. Resolved, never hardcoded.
	const targets = new Map<string, Stripe.Price>()
	for (const interval of ["month", "year"]) {
		const price = await findMembershipPriceForInterval("premium", interval)
		if (price) {
			targets.set(interval, price)
			console.log(`target ${interval}: ${price.id} ${dollars(price.unit_amount)}`)
		}
	}
	if (targets.size === 0) throw new Error(`No current Premium prices found on ${productId}`)
	console.log("")

	// Every recurring price on the product, archived ones included — the old $20/$200 are archived.
	const stale: Stripe.Price[] = []
	for await (const price of stripe.prices.list({ product: productId, limit: 100 })) {
		const interval = price.recurring?.interval
		if (!interval) continue
		const target = targets.get(interval)
		if (target && price.id !== target.id) stale.push(price)
	}

	let moved = 0
	let wouldMove = 0
	const skipped: string[] = []

	for (const oldPrice of stale) {
		const interval = oldPrice.recurring!.interval
		const target = targets.get(interval)!

		for await (const sub of stripe.subscriptions.list({ price: oldPrice.id, status: "all", limit: 100, expand: ["data.customer"] })) {
			if (ONLY && sub.id !== ONLY) continue
			if (sub.status === "canceled" || sub.status === "incomplete_expired") continue

			const customer = sub.customer as Stripe.Customer | Stripe.DeletedCustomer
			const email = ("email" in customer && customer.email) || "(no email)"
			const origin = (sub.metadata as any)?.membershipKey ? `ours:${(sub.metadata as any).membershipKey}` : "unmarked"
			const row = `${sub.id}  ${email}  ${sub.status}  ${dollars(oldPrice.unit_amount)}→${dollars(target.unit_amount)}/${interval}  next ${day(sub.current_period_end)}  ${origin}`

			const reason = !MOVABLE.has(sub.status)
				? `status ${sub.status}`
				: sub.cancel_at_period_end
					? "cancelling at period end"
					: sub.items.data.length !== 1
						? `${sub.items.data.length} items`
						: null
			if (reason) {
				skipped.push(`SKIP (${reason})  ${row}`)
				continue
			}

			if (moved + wouldMove >= LIMIT) continue

			if (!APPLY) {
				console.log(`WOULD MOVE  ${row}`)
				wouldMove++
				continue
			}

			try {
				await stripe.subscriptions.update(sub.id, {
					items: [{ id: sub.items.data[0].id, price: target.id }],
					proration_behavior: "none",
					metadata: { repricedFrom: oldPrice.id, repricedAt: new Date().toISOString() },
				})
				console.log(`MOVED       ${row}`)
				moved++
			} catch (error: any) {
				console.error(`FAILED      ${row}\n            ${error?.message || error}`)
			}
		}
	}

	if (skipped.length) {
		console.log("")
		skipped.forEach((line) => console.log(line))
	}
	console.log(`\n${APPLY ? `moved: ${moved}` : `would move: ${wouldMove}`}   skipped: ${skipped.length}`)
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
