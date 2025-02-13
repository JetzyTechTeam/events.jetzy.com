import { dbconn } from "@Jetzy/configs/database"
import mongoose, { Schema } from "mongoose"

const eventTciketsSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
		},
		price: {
			type: Number,
			required: true,
		},
		desc: {
			type: String,
			required: true,
		},
		priceId: {
			type: String,
			required: true,
		},
		bookingLimits: {
			type: Number,
			required: true,
		},
	},
	{ timestamps: true },
)

// Define the  schema
const eventsSchema = new Schema(
	{
		slug: {
			type: String,
			required: true,
			unique: true,
		},
		name: {
			type: String,
			required: true,
		},

		startsOn: {
			type: Date,
			required: true,
		},
		endsOn: {
			type: Date,
			required: true,
		},
		location: {
			type: String,
			required: true,
		},

		isPaid: {
			type: Boolean,
			required: true,
			default: false,
		},

		desc: {
			type: String,
			required: true,
		},

		images: {
			type: [String],
			required: true,
		},

		tickets: {
			type: [eventTciketsSchema],
			required: false,
		},

		isDeleted: {
			type: Boolean,
			default: false,
		},
	},
	{ timestamps: true },
)

// Export the user model
export const Events = dbconn.models["Events"] || dbconn.model("Events", eventsSchema)
