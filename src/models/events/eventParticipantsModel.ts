import { Model, Schema } from "mongoose"
import { IEventParticipants } from "./types"
import { dbconn } from "@/configs/database"

const eventParticipantsSchema = new Schema<IEventParticipants>(
	{
		event: {
			type: Schema.Types.ObjectId,
			ref: "Events",
			required: true,
			index: true,
		},
		participants: {
			type: [Schema.Types.ObjectId],
			ref: "Users",
			default: [],
		},
		isDeleted: {
			type: Boolean,
			default: false,
		},
	},
	{ timestamps: true },
)

export const EventParticipants: Model<IEventParticipants> =
	dbconn.models["EventParticipants"] || dbconn.model("EventParticipants", eventParticipantsSchema)
