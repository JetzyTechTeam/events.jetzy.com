import { Model, Schema } from "mongoose"
import { IReferralCode } from "./types"
import { dbconn } from "@/configs/database"

const referralCodeSchema = new Schema<IReferralCode>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
		},
		// NOT globally unique any more — see the compound index below. The same string can be
		// run as a campaign across several events, each with its own terms and its own counter.
		code: {
			type: String,
			required: true,
			unique: true,
			index: true,
			uppercase: true,
			trim: true,
		},
		discountPercentage: {
			type: Number,
			required: true,
			min: 0,
			max: 100,
		},
		// Free months of Jetzy Premium this code grants on a ticket that ALREADY sells it.
		//
		// ONE number rather than a tickbox plus a count: two fields can disagree — ticked with
		// zero months, or three months with the box unticked — and then the record no longer
		// says what the buyer gets. 0 or absent means no trial; the host UI renders its tickbox
		// from `> 0`.
		//
		// Orthogonal to `discountPercentage`: a code may discount the ticket, grant free
		// membership months, or both.
		freeMembershipMonths: {
			type: Number,
			required: false,
			default: 0,
			min: 0,
			max: 12,
		},
		commissionPercentage: {
			type: Number,
			default: 10,
			min: 0,
			max: 100,
		},
		isActive: {
			type: Boolean,
			default: true,
			index: true,
		},
		usageCount: {
			type: Number,
			default: 0,
		},
		maxUses: {
			type: Number,
			required: false,
			default: null, // null means unlimited
		},
		createdBy: {
			type: Schema.Types.ObjectId,
			required: false,
		},
		isDeleted: {
			type: Boolean,
			default: false,
			index: true,
		},
	},
	{ timestamps: true },
)

// UNIQUE PER EVENT, not per Jetzy.
//
// `code` used to carry a plain `unique: true`, so one event holding JETZY-ME blocked every other
// event from using the string — invisibly, since a host can only see their own event's codes.
// Uniqueness belongs with the pair: a code means nothing without the event it discounts, and
// `validateReferralCodeForEvent` has always resolved it that way.
//
// The connection sets `autoIndex: false`, so this does NOT build itself. Run
// `scripts/migrate-referral-code-index.ts` once per environment — it drops `code_1` and builds
// this. Never `syncIndexes()`: the mobile app and admin portal share this collection.
referralCodeSchema.index({ eventId: 1, code: 1 }, { unique: true })

export const ReferralCodes: Model<IReferralCode> = dbconn.models["ReferralCodes"] || dbconn.model<IReferralCode>("ReferralCodes", referralCodeSchema)
