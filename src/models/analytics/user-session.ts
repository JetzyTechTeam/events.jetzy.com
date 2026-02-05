import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IUserSession {
	_id: Types.ObjectId
	sessionId: string
	userId?: Types.ObjectId
	startTime: Date
	endTime?: Date
	duration?: number // in seconds
	pageCount: number
	isLoggedIn: boolean
	deviceType?: string
	browserType?: string
	referrer?: string
	entryPage: string
	exitPage?: string
	userAgent?: string
	ipAddress?: string
	createdAt: Date
	updatedAt: Date
}

const userSessionSchema = new Schema<IUserSession>(
	{
		sessionId: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		userId: {
			type: Schema.Types.ObjectId,
			required: false,
			index: true,
			ref: "Users",
		},
		startTime: {
			type: Date,
			required: true,
			default: Date.now,
			index: true,
		},
		endTime: {
			type: Date,
			required: false,
		},
		duration: {
			type: Number,
			required: false, // in seconds
		},
		pageCount: {
			type: Number,
			required: true,
			default: 0,
		},
		isLoggedIn: {
			type: Boolean,
			required: true,
			default: false,
			index: true,
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
		referrer: {
			type: String,
			required: false,
		},
		entryPage: {
			type: String,
			required: true,
		},
		exitPage: {
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
	},
	{ timestamps: true }
)

// Indexes for performance
userSessionSchema.index({ userId: 1, startTime: -1 })
userSessionSchema.index({ startTime: -1 })
userSessionSchema.index({ isLoggedIn: 1, startTime: -1 })
userSessionSchema.index({ exitPage: 1, startTime: -1 }) // For optimized exit pages query

export const UserSession: Model<IUserSession> =
	dbconn.models["UserSession"] || dbconn.model<IUserSession>("UserSession", userSessionSchema)

