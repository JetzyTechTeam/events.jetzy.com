import { Model, Schema, Document, Types } from "mongoose"
import { dbconn } from "@/configs/database"

export interface IInterestSubCategory extends Document {
	name: string
	categoryId: Types.ObjectId
	description?: string
	image?: string
	status: "active" | "inactive"
	isDeleted: boolean
	createdAt: Date
	updatedAt: Date
}

const InterestSubCategorySchema = new Schema<IInterestSubCategory>(
	{
		name: { type: String, required: true },
		categoryId: {
			type: Schema.Types.ObjectId,
			ref: "InterestCategory",
			required: true,
			index: true,
		},
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
InterestSubCategorySchema.index({ categoryId: 1, status: 1, isDeleted: 1 })
InterestSubCategorySchema.index({ categoryId: 1, name: 1 }, { unique: true }) // Ensure unique name per category

const InterestSubCategory: Model<IInterestSubCategory> =
	dbconn.models["InterestSubCategory"] || dbconn.model<IInterestSubCategory>("InterestSubCategory", InterestSubCategorySchema, "interestsubcategories")

export default InterestSubCategory
