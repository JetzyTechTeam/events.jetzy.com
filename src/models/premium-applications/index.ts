import { Schema } from "mongoose"
import { dbconn } from "@/configs/database"

/**
 * One row per Jetzy Premium membership APPLICATION — the questionnaire + card-setup + admin
 * review gate that runs instead of an instant trial subscription when the buyer typed no invite
 * code (see `src/lib/premium-application.ts`).
 *
 * `awaiting_card` → `under_review` → `approved` | `rejected`. `approved` starts the real Stripe
 * subscription (`startMembershipSubscription`, same call `bookings/approve.ts` makes); `rejected`
 * never touches Stripe beyond detaching the saved card. No money moves until approval — the
 * Stripe Checkout Session that collects the card is `mode: "setup"`, never a charge.
 */
const answerSchema = new Schema(
	{
		questionId: { type: String, required: true },
		answer: { type: Schema.Types.Mixed, required: true },
	},
	{ _id: false },
)

const premiumApplicationSchema = new Schema(
	{
		// Identity, not document id — a person can hold two account documents (Users / EventUsers).
		// Reviewed the same way membership reads/writes already are elsewhere in this codebase.
		userId: { type: Schema.Types.ObjectId, required: false, index: true },
		email: { type: String, required: true, index: true },
		name: { type: String, required: false },
		interval: { type: String, enum: ["month", "year"], default: "month" },
		answers: { type: [answerSchema], default: [] },
		status: {
			type: String,
			enum: ["awaiting_card", "under_review", "approved", "rejected"],
			default: "awaiting_card",
			required: true,
			index: true,
		},
		stripeCustomerId: { type: String, required: false },
		setupIntentId: { type: String, required: false },
		// Saved at card setup, read by `[id]/approve.ts` as `default_payment_method` — there is no
		// PaymentIntent here to pull one off, unlike a captured ticket hold.
		paymentMethodId: { type: String, required: false },
		// Resolved and stored at card-setup time (first-timer rule checked against Stripe then), so
		// a later change to account history can't move what was disclosed on the review screen.
		trialMonths: { type: Number, required: false },
		stripeSubscriptionId: { type: String, required: false },
		reviewedAt: { type: Date, required: false },
		reviewedBy: { type: Schema.Types.ObjectId, required: false },
		rejectionReason: { type: String, required: false },
	},
	{ timestamps: true },
)

export const PremiumApplications =
	dbconn.models.PremiumApplications || dbconn.model("PremiumApplications", premiumApplicationSchema, "premium_applications")
