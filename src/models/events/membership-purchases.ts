import { Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

/**
 * One row per membership SALE — the record that answers "who bought, how, and off the back of
 * what".
 *
 * None of this could be answered before. A membership leaves two traces: `premiumSubscription`
 * on the user, which is current state and gets overwritten on every renewal and cancellation,
 * and the Stripe subscription, which knows nothing about our events or codes. Neither says
 * whether the buyer came through `/subscribe` or bought a ticket that included membership, and
 * an invite code was applied to `trial_end` and then forgotten entirely.
 *
 * Written at the moment the subscription is created, from both paths, and never updated
 * afterwards: this is the sale as it happened. Current state stays on the user document.
 *
 * Best-effort at every call site. A missing analytics row must never fail a purchase.
 */

export type MembershipPurchaseSource =
	/** Deliberate signup at `/subscribe` or the paywall modal. */
	| "subscribe"
	/** Sold with an event ticket — the buyer paid for the first period. */
	| "ticket"
	/** Sold with a ticket, but the first months were given away by a referral code. */
	| "gift"
	/** Given away by an invite code typed at signup. No card was collected. */
	| "signup"
	/** A subscription on this Stripe account that this app didn't sell (selectmember.jetzy.com). */
	| "external"

const membershipPurchaseSchema = new Schema(
	{
		/** `premium` | `concierge`. No enum: an unrecognised product must be recordable. */
		key: { type: String, required: true, index: true },
		source: { type: String, required: true, index: true },

		// Who. Email is the durable identifier — a person can hold two account documents, so
		// `userId` alone under-counts (see `findMembershipRecord` in `lib/premium.ts`).
		email: { type: String, required: false, index: true },
		name: { type: String, required: false },
		userId: { type: Schema.Types.ObjectId, required: false, index: true },

		// Billing.
		stripeCustomerId: { type: String, required: false, index: true },
		/**
		 * The idempotency key for this collection. A webhook can be delivered more than once, and
		 * fulfilment can be retried, so writes upsert on this rather than inserting.
		 */
		stripeSubscriptionId: { type: String, required: false, unique: true, sparse: true },
		priceId: { type: String, required: false },
		interval: { type: String, required: false },
		/** Major units — the recurring price, not what was charged today (a trial charges $0). */
		amount: { type: Number, required: false },
		currency: { type: String, required: false, default: "usd" },

		// What brought them.
		/** `/subscribe` invite code, e.g. `jetzy-me`. Lowercased at the write. */
		inviteCode: { type: String, required: false, index: true },
		/** Event referral code, when the membership rode in on a discounted or gifted ticket. */
		referralCode: { type: String, required: false, index: true },
		/** Free months granted at the sale, from either kind of code. */
		trialMonths: { type: Number, required: false },
		/** When the first real charge is due — the end of any trial. */
		trialEndsAt: { type: Date, required: false },

		// Where, when it came with a ticket.
		eventId: { type: Schema.Types.ObjectId, required: false, index: true },
		bookingRef: { type: String, required: false, index: true },
	},
	{ timestamps: true },
)

// Reporting is almost always "this product, newest first, in a date window".
membershipPurchaseSchema.index({ key: 1, createdAt: -1 })

export const MembershipPurchases =
	dbconn.models.MembershipPurchases ||
	dbconn.model("MembershipPurchases", membershipPurchaseSchema, "membership_purchases")

export type RecordMembershipPurchase = {
	key: string
	source: MembershipPurchaseSource
	email?: string
	name?: string
	userId?: string
	stripeCustomerId?: string
	stripeSubscriptionId?: string
	priceId?: string
	interval?: string
	amount?: number
	currency?: string
	inviteCode?: string
	referralCode?: string
	trialMonths?: number
	trialEndsAt?: Date
	eventId?: string
	bookingRef?: string
}

/**
 * Record a sale. Swallows its own failures by design — every caller is mid-purchase, and money
 * has usually already moved by the time this runs.
 *
 * Upserts on `stripeSubscriptionId` so a replayed webhook updates one row instead of inflating
 * the count. `$setOnInsert` on the codes and the source: the FIRST write is the one that saw the
 * checkout, and a later replay carrying less context must not blank what it recorded.
 */
export async function recordMembershipPurchase(input: RecordMembershipPurchase): Promise<void> {
	try {
		const doc: Record<string, any> = {
			key: input.key,
			source: input.source,
			...(input.email ? { email: input.email.trim() } : {}),
			...(input.name ? { name: input.name } : {}),
			...(input.userId && Types.ObjectId.isValid(input.userId) ? { userId: new Types.ObjectId(input.userId) } : {}),
			...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
			...(input.priceId ? { priceId: input.priceId } : {}),
			...(input.interval ? { interval: input.interval } : {}),
			...(typeof input.amount === "number" ? { amount: input.amount } : {}),
			...(input.currency ? { currency: input.currency } : {}),
			...(input.inviteCode ? { inviteCode: input.inviteCode.trim().toLowerCase() } : {}),
			...(input.referralCode ? { referralCode: input.referralCode.trim().toUpperCase() } : {}),
			...(input.trialMonths ? { trialMonths: input.trialMonths } : {}),
			...(input.trialEndsAt ? { trialEndsAt: input.trialEndsAt } : {}),
			...(input.eventId && Types.ObjectId.isValid(input.eventId) ? { eventId: new Types.ObjectId(input.eventId) } : {}),
			...(input.bookingRef ? { bookingRef: input.bookingRef } : {}),
		}

		if (input.stripeSubscriptionId) {
			await MembershipPurchases.updateOne(
				{ stripeSubscriptionId: input.stripeSubscriptionId },
				{ $setOnInsert: { ...doc, stripeSubscriptionId: input.stripeSubscriptionId } },
				{ upsert: true },
			)
		} else {
			// No subscription id means nothing to be idempotent on. Rare enough to accept a
			// possible duplicate rather than lose the sale from the report entirely.
			await MembershipPurchases.create(doc)
		}
	} catch (error: any) {
		console.error("[membership-purchases] Could not record the sale:", error?.message || error)
	}
}
