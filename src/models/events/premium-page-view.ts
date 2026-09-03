import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

/**
 * A visit to `/premium` or `/subscribe`, recorded BEFORE anything is known about who bought.
 *
 * `membership_purchases` only knows about a sale once Stripe confirms it, so anyone who opened
 * the page — including a host's referral share link (`/premium?code=&event=`) — and never
 * bought is invisible there. This records the landing and the two steps after it, so the growth
 * report can show opens vs. checkout-started vs. purchased instead of only the last one.
 *
 * Keyed on the analytics `anonId` (localStorage), the same id the rest of journey tracking
 * uses. No email, no session required to write a row.
 *
 * ONE ROW PER (page, code, anonId) — a visitor who opens both the plain page and a referral
 * link gets two rows, which is correct: they are two different offers. `views` counts return
 * visits; the stage timestamps use `$min` so the EARLIEST moment wins.
 *
 * `purchasedAt` is written by the Stripe webhook, matched on the `premiumAnonId` / `premiumCode`
 * / `premiumPage` stamped into Checkout Session metadata by `/api/subscriptions/checkout` — the
 * webhook never sees the browser, so this is the only way to close the loop back to a specific
 * visit.
 */
export interface IPremiumPageView {
	_id?: string
	/** localStorage `analytics_anon_id`. */
	anonId: string
	sessionId?: string
	page: "premium" | "subscribe"
	/** Invite/referral code present when this visit started, "" for a plain visit. */
	code: string
	/** Only set alongside a code that came from a host's referral share link. */
	eventId?: Schema.Types.ObjectId
	/** How many times this person opened this page with this code. */
	views: number
	landedAt?: Date
	/** They clicked through to Stripe (or, for a $0 trial, straight to activation). */
	checkoutStartedAt?: Date
	/** Confirmed by the webhook once Stripe reports the subscription created. */
	purchasedAt?: Date
	createdAt?: Date
	updatedAt?: Date
}

const premiumPageViewSchema = new Schema<IPremiumPageView>(
	{
		anonId: {
			type: String,
			required: true,
			trim: true,
		},
		sessionId: {
			type: String,
			required: false,
		},
		page: {
			type: String,
			required: true,
			enum: ["premium", "subscribe"],
		},
		code: {
			type: String,
			required: false,
			default: "",
			trim: true,
		},
		eventId: {
			type: Schema.Types.ObjectId,
			required: false,
			ref: "Events",
		},
		views: {
			type: Number,
			default: 0,
		},
		landedAt: { type: Date, required: false },
		checkoutStartedAt: { type: Date, required: false },
		purchasedAt: { type: Date, required: false },
	},
	{
		timestamps: true,
	},
)

// Lookup for the upsert and for the funnel aggregation. Built by
// scripts/create-premium-view-index.ts (`autoIndex: false`).
//
// Deliberately NOT unique — same reasoning as `event-album-views`: a unique index that failed to
// build would throw 11000 on a page visit, which is the one place an analytics write must never
// be visible. Every count that has to be exact groups by `anonId` anyway.
premiumPageViewSchema.index({ page: 1, code: 1, anonId: 1 })
premiumPageViewSchema.index({ eventId: 1, createdAt: -1 })
premiumPageViewSchema.index({ page: 1, createdAt: -1 })

export const PremiumPageView: Model<IPremiumPageView> =
	dbconn.models["PremiumPageView"] || dbconn.model("PremiumPageView", premiumPageViewSchema, "premium_page_views")
