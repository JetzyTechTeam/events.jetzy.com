import { Model, Schema } from "mongoose"
import { IEventTracker } from "./types"
import { dbconn } from "@/configs/database"

const eventTrackerSchema = new Schema<IEventTracker>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
		},
		bookedTickets: {
			type: Number,
			required: true,
			default: 0,
		},
		eventCapacity: {
			type: Number,
			required: true,
		},
	},
	{ timestamps: true },
)

export const EventTracker: Model<IEventTracker> = dbconn.models["EventTracker"] || dbconn.model("EventTracker", eventTrackerSchema)
