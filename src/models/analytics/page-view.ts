import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IPageView {
	_id: Types.ObjectId
	sessionId: string
	userId?: Types.ObjectId
	page: string
	pageTitle?: string
	referrer?: string
	userAgent?: string
	ipAddress?: string
	deviceType?: string
	browserType?: string
	timestamp: Date
	timeSpent?: number // seconds spent on page
	utmSource?: string
	utmMedium?: string
	utmCampaign?: string
	createdAt: Date
	updatedAt: Date
}

const pageViewSchema = new Schema<IPageView>(
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
		page: {
			type: String,
			required: true,
			index: true,
		},
		pageTitle: {
			type: String,
			required: false,
		},
		referrer: {
			type: String,
			required: false,
		},
		userAgent: {
			type: String,
			required: false,
		},
		ipAddress: {
			type: String,
			required: false,
		},
		deviceType: {
			type: String,
			required: false,
			enum: ["mobile", "desktop", "tablet"],
		},
		browserType: {
			type: String,
			required: false,
		},
		timestamp: {
			type: Date,
			default: Date.now,
			required: true,
			index: true,
		},
		timeSpent: {
			type: Number,
			required: false, // in seconds
		},
		utmSource: {
			type: String,
			required: false,
		},
		utmMedium: {
			type: String,
			required: false,
		},
		utmCampaign: {
			type: String,
			required: false,
		},
	},
	{ timestamps: true }
)

// Indexes for performance
pageViewSchema.index({ sessionId: 1, timestamp: 1 })
pageViewSchema.index({ userId: 1, timestamp: 1 })
pageViewSchema.index({ page: 1, timestamp: 1 })
pageViewSchema.index({ timestamp: -1 })

export const PageView: Model<IPageView> =
	dbconn.models["PageView"] || dbconn.model<IPageView>("PageView", pageViewSchema)

