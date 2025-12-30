import { Model, Schema, Document, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface ISavedEvent extends Document {
	userId: Types.ObjectId
	eventId: Types.ObjectId
	createdAt?: Date
	updatedAt?: Date
}

const savedEventSchema = new Schema<ISavedEvent>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: "Users",
			required: true,
			index: true,
		},
		eventId: {
			type: Schema.Types.ObjectId,
			ref: "Events",
			required: true,
			index: true,
		},
	},
	{
		timestamps: true,
	}
)

// Create compound index to ensure one user can only save an event once
savedEventSchema.index({ userId: 1, eventId: 1 }, { unique: true })

export const SavedEvents: Model<ISavedEvent> =
	dbconn.models["SavedEvents"] || dbconn.model("SavedEvents", savedEventSchema)

