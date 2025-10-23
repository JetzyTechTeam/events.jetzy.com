import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"
import { IBookings } from "./events/types"

export interface ICheckIn {
	_id: Types.ObjectId
	bookingId: Types.ObjectId
	eventId: Types.ObjectId
	bookingRef: string
	customerEmail: string
	customerName: string
	totalTickets: number // Total tickets purchased
	checkedInCount: number // Number of guests checked in
	checkInHistory: Array<{
		count: number
		timestamp: Date
		adminId: string
		adminName: string
	}>
	firstCheckInAt?: Date
	lastCheckInAt?: Date
	isFullyCheckedIn: boolean
	createdAt: Date
	updatedAt: Date
}

const checkInHistorySchema = new Schema(
	{
		count: {
			type: Number,
			required: true,
		},
		timestamp: {
			type: Date,
			default: Date.now,
		},
		adminId: {
			type: String,
			required: true,
		},
		adminName: {
			type: String,
			required: true,
		},
	},
	{ _id: false },
)

const checkInSchema = new Schema<ICheckIn>(
	{
		bookingId: {
			type: Schema.Types.ObjectId,
			required: true,
			unique: true,
			index: true,
			ref: "Bookings",
		},
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
			ref: "Events",
		},
		bookingRef: {
			type: String,
			required: true,
			index: true,
		},
		customerEmail: {
			type: String,
			required: true,
			index: true,
		},
		customerName: {
			type: String,
			required: true,
		},
		totalTickets: {
			type: Number,
			required: true,
			min: 1,
		},
		checkedInCount: {
			type: Number,
			required: true,
			default: 0,
			min: 0,
		},
		checkInHistory: {
			type: [checkInHistorySchema],
			default: [],
		},
		firstCheckInAt: {
			type: Date,
		},
		lastCheckInAt: {
			type: Date,
		},
		isFullyCheckedIn: {
			type: Boolean,
			default: false,
		},
	},
	{
		timestamps: true,
	},
)

// Indexes for fast lookups
checkInSchema.index({ eventId: 1, customerEmail: 1 })
checkInSchema.index({ eventId: 1, bookingRef: 1 })

export const CheckIn: Model<ICheckIn> = dbconn.models["CheckIn"] || dbconn.model<ICheckIn>("CheckIn", checkInSchema)
