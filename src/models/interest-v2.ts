import { Model, Schema, Document } from "mongoose"
import { dbconn } from "@/configs/database"
import { UserInterface } from "@/types"

export interface InterestI extends Document {
	name: string
	type: "public" | "private"
	description: string
	image: string
	createdBy: Schema.Types.ObjectId | UserInterface
	status: "active" | "pending" | "deleted"
	createdAt: Date
	updatedAt: Date
}

const InterestSchema = new Schema<InterestI>(
	{
		name: { type: String, required: true },
		type: { type: String, enum: ["public", "private"], required: true },
		description: { type: String, required: false },
		image: { type: String, required: false },
		createdBy: {
			type: Schema.Types.ObjectId,
			ref: "Users",
			required: true,
		},
		status: { type: String, enum: ["active", "pending", "deleted"], default: "pending" },
	},
	{
		timestamps: true,
	}
)

const InterestV2model: Model<InterestI> =
	dbconn.models["InterestV2"] || dbconn.model<InterestI>("InterestV2", InterestSchema, "interests-v2")

export default InterestV2model

