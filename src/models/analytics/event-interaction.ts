import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IEventInteraction {
	_id: Types.ObjectId
	eventId: Types.ObjectId
	sessionId: string
	userId?: Types.ObjectId
	interactionType: string
	timestamp: Date
	metadata?: any
	createdAt: Date
	updatedAt: Date
}

const eventInteractionSchema = new Schema<IEventInteraction>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
			ref: "Events",
		},
		sessionId: {
			type: String,
			required: true,
			index: true,
		},
		userId: {
			type: Schema.Types.ObjectId,
			required: false,
			index: true,
			ref: "Users",
		},
		interactionType: {
			type: String,
			required: true,
			enum: ["view", "click", "share", "ticket_select", "booking_start"],
			index: true,
		},
		timestamp: {
			type: Date,
			default: Date.now,
			required: true,
			index: true,
		},
		metadata: {
			type: Schema.Types.Mixed,
			required: false,
		},
	},
	{ timestamps: true }
)

// Indexes for performance
eventInteractionSchema.index({ eventId: 1, interactionType: 1 })
eventInteractionSchema.index({ eventId: 1, timestamp: -1 })
eventInteractionSchema.index({ sessionId: 1, timestamp: -1 })
eventInteractionSchema.index({ userId: 1, timestamp: -1 })

export const EventInteraction: Model<IEventInteraction> =
	dbconn.models["EventInteraction"] ||
	dbconn.model<IEventInteraction>("EventInteraction", eventInteractionSchema)

