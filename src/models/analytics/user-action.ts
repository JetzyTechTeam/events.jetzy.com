import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IUserAction {
	_id: Types.ObjectId
	sessionId: string
	userId?: Types.ObjectId
	actionType: string
	page: string
	timestamp: Date
	metadata?: any
	createdAt: Date
	updatedAt: Date
}

const userActionSchema = new Schema<IUserAction>(
	{
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
		actionType: {
			type: String,
			required: true,
			index: true,
			enum: [
				"search",
				"filter",
				"category_click",
				"form_start",
				"form_complete",
				"share",
				"button_click",
				"link_click",
			],
		},
		page: {
			type: String,
			required: true,
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
userActionSchema.index({ sessionId: 1, timestamp: -1 })
userActionSchema.index({ userId: 1, timestamp: -1 })
userActionSchema.index({ actionType: 1, timestamp: -1 })

export const UserAction: Model<IUserAction> =
	dbconn.models["UserAction"] || dbconn.model<IUserAction>("UserAction", userActionSchema)

