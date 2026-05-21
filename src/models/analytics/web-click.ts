import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IWebClick {
	_id: Types.ObjectId
	sessionId: string
	userId?: Types.ObjectId
	anonId?: string
	page: string
	eventId?: Types.ObjectId
	elementTag?: string
	elementText?: string
	elementId?: string
	elementClass?: string
	dataTrack?: string
	href?: string
	x?: number
	y?: number
	viewportW?: number
	viewportH?: number
	isRageClick: boolean
	isDeadClick: boolean
	timestamp: Date
	createdAt: Date
	updatedAt: Date
}

const webClickSchema = new Schema<IWebClick>(
	{
		sessionId: { type: String, required: true, index: true },
		userId: { type: Schema.Types.ObjectId, required: false, index: true, ref: "Users" },
		anonId: { type: String, required: false, index: true },
		page: { type: String, required: true, index: true },
		eventId: { type: Schema.Types.ObjectId, required: false, index: true, ref: "Events" },
		elementTag: { type: String, required: false },
		elementText: { type: String, required: false, maxlength: 200 },
		elementId: { type: String, required: false },
		elementClass: { type: String, required: false, maxlength: 300 },
		dataTrack: { type: String, required: false, index: true },
		href: { type: String, required: false },
		x: { type: Number, required: false },
		y: { type: Number, required: false },
		viewportW: { type: Number, required: false },
		viewportH: { type: Number, required: false },
		isRageClick: { type: Boolean, required: true, default: false, index: true },
		isDeadClick: { type: Boolean, required: true, default: false },
		timestamp: { type: Date, required: true, default: Date.now, index: true },
	},
	{ timestamps: true }
)

webClickSchema.index({ sessionId: 1, timestamp: 1 })
webClickSchema.index({ eventId: 1, timestamp: -1 })
webClickSchema.index({ page: 1, timestamp: -1 })
webClickSchema.index({ userId: 1, timestamp: -1 })

export const WebClick: Model<IWebClick> =
	dbconn.models["WebClick"] ||
	dbconn.model<IWebClick>("WebClick", webClickSchema, "analytics_web_clicks")
