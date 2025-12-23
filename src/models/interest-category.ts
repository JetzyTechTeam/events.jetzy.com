import { Model, Schema, Document } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IInterestCategory extends Document {
	name: string
	description?: string
	image?: string
	status: "active" | "inactive"
	isDeleted: boolean
	createdAt: Date
	updatedAt: Date
}

const InterestCategorySchema = new Schema<IInterestCategory>(
	{
		name: { type: String, required: true, unique: true },
		description: { type: String, required: false },
		image: { type: String, required: false },
		status: { type: String, enum: ["active", "inactive"], default: "active" },
		isDeleted: { type: Boolean, default: false },
	},
	{
		timestamps: true,
	}
)

// Index for faster queries
InterestCategorySchema.index({ status: 1, isDeleted: 1 })

const InterestCategory: Model<IInterestCategory> =
	dbconn.models["InterestCategory"] || dbconn.model<IInterestCategory>("InterestCategory", InterestCategorySchema, "interestcategories")

export default InterestCategory
