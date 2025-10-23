import { Model, Schema, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IEventGuest {
	_id: Types.ObjectId
	eventId: Types.ObjectId
	bookingId: Types.ObjectId
	checkInId: Types.ObjectId
	bookingEmail: string // The email that made the booking
	guestName: string
	guestEmail: string
	guestPhone: string
	checkedInAt: Date
	checkedInBy: string // Admin who checked them in
	createdAt: Date
	updatedAt: Date
}

const eventGuestSchema = new Schema<IEventGuest>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
			ref: "Events",
		},
		bookingId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
			ref: "Bookings",
		},
		checkInId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
			ref: "CheckIn",
		},
		bookingEmail: {
			type: String,
			required: true,
			index: true,
		},
		guestName: {
			type: String,
			required: true,
		},
		guestEmail: {
			type: String,
			required: true,
			index: true,
		},
		guestPhone: {
			type: String,
			required: true,
		},
		checkedInAt: {
			type: Date,
			required: true,
			default: Date.now,
		},
		checkedInBy: {
			type: String,
			required: true,
		},
	},
	{
		timestamps: true,
	},
)

// Compound index for efficient queries
eventGuestSchema.index({ eventId: 1, bookingEmail: 1 })
eventGuestSchema.index({ eventId: 1, guestEmail: 1 })

let EventGuest: Model<IEventGuest>

try {
	EventGuest = dbconn.model<IEventGuest>("EventGuest")
} catch {
	EventGuest = dbconn.model<IEventGuest>("EventGuest", eventGuestSchema)
}

export { EventGuest }
