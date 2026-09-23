import { Model, Schema } from "mongoose"
import { IBlast } from "./types"
import { dbconn } from "@/configs/database"

const blastSchema = new Schema<IBlast>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
		},
		subject: {
			type: String,
			default: "",
		},
		message: {
			type: String,
			required: true,
		},
		targetType: {
			type: String,
			enum: ["all", "bookings", "invitations"],
			default: "all",
		},
		status: {
			type: String,
			default: "all",
		},
		emailType: {
			type: String,
			enum: ["custom", "availability"],
			default: "custom",
		},
		recipientCount: {
			type: Number,
			default: 0,
		},
		succeededCount: {
			type: Number,
			default: 0,
		},
		failedCount: {
			type: Number,
			default: 0,
		},
		sentBy: {
			type: Schema.Types.ObjectId,
			required: false,
		},
		// What the recipients actually saw in their inbox, and where a reply goes.
		//
		// NO DEFAULTS: absent means a blast sent before host identity existed, which is not the
		// same as one deliberately sent as "Jetzy". The history shows nothing rather than
		// claiming a sender we can't vouch for.
		sentFromName: {
			type: String,
			required: false,
		},
		sentReplyTo: {
			type: String,
			required: false,
		},
		// Per-recipient outcome, so "5/7 delivered" can answer WHO and WHY.
		//
		// `status` starts as `sent` or `failed` at send time and is UPDATED LATER by the SendGrid
		// event webhook when a bounce, block or spam report arrives — those can land hours after
		// the send, so this is deliberately not frozen. See `src/lib/blast-delivery.ts`.
		//
		// No enum on `status`: the webhook is an external source and a value we don't recognise
		// must be storable rather than rejected mid-write. The UI falls back gracefully.
		//
		// Excluded from the blast LIST query — a 2,000-guest blast is a large array and the
		// history only needs counts. Fetched on demand by the detail endpoint.
		recipients: {
			type: [
				{
					_id: false,
					email: { type: String, required: true },
					name: { type: String, required: false },
					status: { type: String, required: true },
					reason: { type: String, required: false },
					respondedAt: { type: Date, required: false },
				},
			],
			required: false,
		},
		sentAt: {
			type: Date,
			default: Date.now,
		},
		isDeleted: {
			type: Boolean,
			default: false,
			index: true,
		},
	},
	{ timestamps: true },
)

// Compound index for listing an event's blasts efficiently
blastSchema.index({ eventId: 1, isDeleted: 1, createdAt: -1 })

export const Blasts: Model<IBlast> = dbconn.models["Blasts"] || dbconn.model<IBlast>("Blasts", blastSchema)
