import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IJourneyStep {
	action: string
	page?: string
	eventId?: Types.ObjectId
	timestamp: Date
	duration?: number // in seconds
	metadata?: any
}

export interface IUserJourney {
	_id: Types.ObjectId
	sessionId: string
	userId?: Types.ObjectId
	journey: IJourneyStep[]
	createdAt: Date
	updatedAt: Date
}

const journeyStepSchema = new Schema<IJourneyStep>(
	{
		action: {
			type: String,
			required: true,
		},
		page: {
			type: String,
			required: false,
		},
		eventId: {
			type: Schema.Types.ObjectId,
			required: false,
			ref: "Events",
		},
		timestamp: {
			type: Date,
			required: true,
			default: Date.now,
		},
		duration: {
			type: Number,
			required: false, // in seconds
		},
		metadata: {
			type: Schema.Types.Mixed,
			required: false,
		},
	},
	{ _id: false }
)

const userJourneySchema = new Schema<IUserJourney>(
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
		journey: {
			type: [journeyStepSchema],
			required: true,
			default: [],
		},
	},
	{ timestamps: true }
)

// Indexes for performance
userJourneySchema.index({ sessionId: 1, createdAt: -1 })
userJourneySchema.index({ userId: 1, createdAt: -1 })
userJourneySchema.index({ createdAt: -1 })

export const UserJourney: Model<IUserJourney> =
	dbconn.models["UserJourney"] || dbconn.model<IUserJourney>("UserJourney", userJourneySchema)

