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
