import { dbconn } from "@/configs/database"
import { Schema, Model } from "mongoose"

export interface IEventTraffic {
	eventId: Schema.Types.ObjectId
	referralCode?: string
	visitorId?: string // Anonymous visitor ID
	userId?: Schema.Types.ObjectId // Logged-in user ID
	timestamp: Date
	metadata?: any
}

const eventTrafficSchema = new Schema<IEventTraffic>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
			ref: "Events",
		},
		referralCode: {
			type: String,
			required: false,
			index: true,
		},
		visitorId: {
			type: String,
			required: false,
			index: true,
		},
		userId: {
			type: Schema.Types.ObjectId,
			required: false,
			index: true,
			ref: "Users",
		},
		timestamp: {
			type: Date,
			default: Date.now,
			index: true,
		},
		metadata: {
			type: Schema.Types.Mixed,
			required: false,
		},
	},
	{ timestamps: { createdAt: "timestamp", updatedAt: false } }
)

export const EventTraffic: Model<IEventTraffic> =
	dbconn.models["EventTraffic"] || dbconn.model<IEventTraffic>("EventTraffic", eventTrafficSchema)
