import { dbconn } from "@Jetzy/configs/database"
import mongoose, { Schema } from "mongoose"

const datetimeSchema = new Schema(
	{
		start: {
			type: Date,
			required: true,
		},
		end: {
			type: Date,
			required: true,
		},
	},
	{ _id: false, timestamps: false },
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

		datetime: datetimeSchema,
		location: {
			type: String,
			required: true,
		},

		interest: {
			type: Array<String>,
			required: true,
		},

		privacy: {
			type: String,
			required: true,
			enum: {
				values: ["private", "public", "group"],
				message: "Invalid privacy type",
			},
			default: "public",
		},
		isPaid: {
			type: Boolean,
			required: true,
			default: false,
		},
		amount: {
			type: Number,
			required: false,
			default: 0,
		},

		desc: {
			type: String,
			required: true,
		},
		externalUrl: {
			type: String,
			required: false,
		},
		image: {
			type: String,
			required: true,
		},
	},
	{ timestamps: true },
)

// Export the user model
export const Events = dbconn.models["Events"] || dbconn.model("Events", eventsSchema)
