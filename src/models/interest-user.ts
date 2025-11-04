import { Schema, Document, Types, Model } from "mongoose"
import { dbconn } from "@/configs/database"
import { UserInterface } from "@/types"

export interface InterestUserI extends Document {
	interestId: Types.ObjectId
	userId: Types.ObjectId | UserInterface
	isRequest: boolean
	status: "active" | "pending"
	isAdmin?: boolean
	createdAt: Date
	updatedAt: Date
}

const InterestUserSchema = new Schema<InterestUserI>(
	{
		interestId: {
			type: Schema.Types.ObjectId,
			ref: "InterestV2",
			required: true,
		},
		userId: { type: Schema.Types.ObjectId, ref: "Users", required: true },
		isRequest: {
			type: Schema.Types.Boolean,
			default: false,
		},
		isAdmin: {
			type: Schema.Types.Boolean,
			default: false,
		},
		status: {
			type: Schema.Types.String,
			enum: ["active", "pending"],
			default: "pending",
		},
	},
	{
		timestamps: true,
	}
)

const InterestUsermodel: Model<InterestUserI> =
	dbconn.models["InterestUser"] || dbconn.model<InterestUserI>("InterestUser", InterestUserSchema, "interest-users")

export default InterestUsermodel

