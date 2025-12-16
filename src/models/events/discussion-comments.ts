import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

export interface IDiscussionComment {
	_id?: string
	eventId: Schema.Types.ObjectId
	discussionPostId: Schema.Types.ObjectId
	userId: Schema.Types.ObjectId
	comment: string
	parentCommentId?: Schema.Types.ObjectId | null
	images?: string[]
	reactions: {
		likes: Schema.Types.ObjectId[]
	}
	isEdited: boolean
	editedAt?: Date
	isDeleted: boolean
	createdAt?: Date
	updatedAt?: Date
}

const discussionCommentSchema = new Schema<IDiscussionComment>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Events",
			index: true,
		},
		discussionPostId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "DiscussionPosts",
			index: true,
		},
		userId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Users",
			index: true,
		},
		comment: {
			type: String,
			required: true,
		},
		parentCommentId: {
			type: Schema.Types.ObjectId,
			ref: "DiscussionComments",
			default: null,
			index: true,
		},
		images: {
			type: [String],
			default: [],
		},
		reactions: {
			likes: {
				type: [Schema.Types.ObjectId],
				ref: "Users",
				default: [],
			},
		},
		isEdited: {
			type: Boolean,
			default: false,
		},
		editedAt: {
			type: Date,
		},
		isDeleted: {
			type: Boolean,
			default: false,
		},
	},
	{
		timestamps: true,
	}
)

// Indexes for better query performance
discussionCommentSchema.index({ discussionPostId: 1, createdAt: 1 })
discussionCommentSchema.index({ parentCommentId: 1 })

export const DiscussionComments: Model<IDiscussionComment> =
	dbconn.models["DiscussionComments"] || dbconn.model("DiscussionComments", discussionCommentSchema, "discussion-comments")
