import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export type WebFormInteraction = "focus" | "field_change" | "submit" | "abandon"

export interface IWebForm {
	_id: Types.ObjectId
	sessionId: string
	userId?: Types.ObjectId
	anonId?: string
	page: string
	eventId?: Types.ObjectId
	formName: string
	interactionType: WebFormInteraction
	fieldName?: string
	timestamp: Date
	createdAt: Date
	updatedAt: Date
}

const webFormSchema = new Schema<IWebForm>(
	{
		sessionId: { type: String, required: true, index: true },
		userId: { type: Schema.Types.ObjectId, required: false, index: true, ref: "Users" },
		anonId: { type: String, required: false, index: true },
		page: { type: String, required: true, index: true },
		eventId: { type: Schema.Types.ObjectId, required: false, index: true, ref: "Events" },
		formName: { type: String, required: true, index: true },
		interactionType: {
			type: String,
			required: true,
			enum: ["focus", "field_change", "submit", "abandon"],
			index: true,
		},
		fieldName: { type: String, required: false },
		timestamp: { type: Date, required: true, default: Date.now, index: true },
	},
	{ timestamps: true }
)

webFormSchema.index({ sessionId: 1, timestamp: 1 })
webFormSchema.index({ eventId: 1, interactionType: 1 })
webFormSchema.index({ formName: 1, interactionType: 1 })

export const WebForm: Model<IWebForm> =
	dbconn.models["WebForm"] ||
	dbconn.model<IWebForm>("WebForm", webFormSchema, "analytics_web_forms")
