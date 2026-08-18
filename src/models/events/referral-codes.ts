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

// Compound index for eventId + code for efficient lookups
referralCodeSchema.index({ eventId: 1, code: 1 })

export const ReferralCodes: Model<IReferralCode> = dbconn.models["ReferralCodes"] || dbconn.model<IReferralCode>("ReferralCodes", referralCodeSchema)
