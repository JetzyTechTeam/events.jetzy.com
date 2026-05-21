import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IWebScroll {
	_id: Types.ObjectId
	sessionId: string
	userId?: Types.ObjectId
	anonId?: string
	page: string
	eventId?: Types.ObjectId
	maxDepthPct: number
	reachedMilestones: number[]
	timestamp: Date
	createdAt: Date
	updatedAt: Date
}

const webScrollSchema = new Schema<IWebScroll>(
	{
		sessionId: { type: String, required: true, index: true },
		userId: { type: Schema.Types.ObjectId, required: false, index: true, ref: "Users" },
		anonId: { type: String, required: false, index: true },
		page: { type: String, required: true, index: true },
		eventId: { type: Schema.Types.ObjectId, required: false, index: true, ref: "Events" },
		maxDepthPct: { type: Number, required: true, default: 0, min: 0, max: 100 },
		reachedMilestones: { type: [Number], required: true, default: [] },
		timestamp: { type: Date, required: true, default: Date.now, index: true },
	},
	{ timestamps: true }
)

webScrollSchema.index({ sessionId: 1, page: 1 }, { unique: true })
webScrollSchema.index({ eventId: 1, maxDepthPct: -1 })

export const WebScroll: Model<IWebScroll> =
	dbconn.models["WebScroll"] ||
	dbconn.model<IWebScroll>("WebScroll", webScrollSchema, "analytics_web_scroll")
