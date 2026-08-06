

import { dbconn } from "@Jetzy/configs/database"
import { Roles } from "@Jetzy/types"
import { Schema } from "mongoose"
// Define the user schema
export const usersSchema = new Schema(
	{
		firstName: {
			type: String,
			required: true,
		},

		lastName: {
			type: String,
			required: false,
			default: "",
		},
		email: {
			type: String,
			required: true,
			unique: true,
		},

		password: {
			type: String,
			required: false,
		},

		role: {
			type: String,
			required: true,
			enum: {
				values: Object.values(Roles),
				message: "Invalid status type",
			},
			default: "user",
		},
		image: {
			type: String,
			required: false,
		},
		authProvider: {
			type: String,
			default: "credentials",
		},
		firebaseUid: {
			type: String,
			required: false,
		},
		acceptedTerms: {
			type: Boolean,
			default: false,
		},
		acceptedTermsAt: {
			type: Date,
			required: false,
		},
		// Account safety fields
		isBlocked: {
			type: Boolean,
			default: false,
		},
		emailBounced: {
			type: Boolean,
			default: false,
		},
		// Password reset fields
		passwordResetToken: {
			type: String,
			required: false,
		},
		passwordResetTokenExpiresAt: {
			type: Date,
			required: false,
		},
		// Email verification (signup verify-link flow)
		emailVerified: {
			type: Boolean,
			default: true,
		},
		verifyToken: {
			type: String,
			required: false,
			index: true,
		},
		verifyTokenExpiresAt: {
			type: Date,
			required: false,
		},
		// The user's Stripe Customer — a BILLING IDENTITY, not a membership. One customer holds
		// every subscription this person has, which is what lets the Stripe billing portal show
		// them all with a single link. It used to live inside `premiumSubscription`; that copy
		// is still read as a fallback (`getUserStripeCustomerId`) so no backfill is needed.
		stripeCustomerId: { type: String, required: false, index: true },
		// Jetzy Premium Events subscription (Stripe recurring payment)
		premiumSubscription: {
			active: { type: Boolean, default: false },
			stripeCustomerId: { type: String, required: false },
			stripeSubscriptionId: { type: String, required: false },
			status: { type: String, required: false },
			currentPeriodEnd: { type: Date, required: false },
			cancelAtPeriodEnd: { type: Boolean, default: false },
		},
		// Full Concierge Membership — sold on selectmember.jetzy.com, billed through OUR Stripe
		// when it rides along with a ticket, and mirrored back to their site by
		// `src/lib/select-member.ts`. Structurally identical to `premiumSubscription` and kept
		// strictly separate from it: the two are independent, and one ending must never end
		// the other.
		conciergeSubscription: {
			active: { type: Boolean, default: false },
			stripeCustomerId: { type: String, required: false },
			stripeSubscriptionId: { type: String, required: false },
			status: { type: String, required: false },
			currentPeriodEnd: { type: Date, required: false },
			cancelAtPeriodEnd: { type: Boolean, default: false },
		},
	},
	{ timestamps: true },
)

export const Users = dbconn.models.Users || dbconn.model("Users", usersSchema, 'users')
