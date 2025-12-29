import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

export interface IDiscussionPost {
	_id?: string
	eventId: Schema.Types.ObjectId
	userId: Schema.Types.ObjectId
	title: string
	content: string
	images?: string[]
	attachments?: string[]
	isPinned: boolean
	isLocked: boolean
	tags?: string[]
	reactions: {
		likes: Schema.Types.ObjectId[]
		helpful: Schema.Types.ObjectId[]
	}
	viewCount: number
	commentCount: number
	lastActivityAt: Date
	createdAt?: Date
	updatedAt?: Date
}

const discussionPostSchema = new Schema<IDiscussionPost>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Events",
			index: true,
		},
		userId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Users",
			index: true,
		},
		title: {
			type: String,
			required: true,
			trim: true,
		},
		content: {
			type: String,
			required: false,
			default: "",
		},
		images: {
			type: [String],
			default: [],
		},
		attachments: {
			type: [String],
			default: [],
		},
		isPinned: {
			type: Boolean,
			default: false,
			index: true,
		},
		isLocked: {
			type: Boolean,
			default: false,
		},
		tags: {
			type: [String],
			default: [],
			index: true,
		},
		reactions: {
			likes: {
				type: [Schema.Types.ObjectId],
				ref: "Users",
				default: [],
			},
			helpful: {
				type: [Schema.Types.ObjectId],
				ref: "Users",
				default: [],
			},
		},
		viewCount: {
			type: Number,
			default: 0,
		},
		commentCount: {
			type: Number,
			default: 0,
		},
		lastActivityAt: {
			type: Date,
			default: Date.now,
			index: true,
		},
	},
	{
		timestamps: true,
	}
)

// Indexes for better query performance
discussionPostSchema.index({ eventId: 1, isPinned: -1, lastActivityAt: -1 })
discussionPostSchema.index({ eventId: 1, createdAt: -1 })
discussionPostSchema.index({ tags: 1 })

export const DiscussionPosts: Model<IDiscussionPost> =
	dbconn.models["DiscussionPosts"] || dbconn.model("DiscussionPosts", discussionPostSchema, "discussion-posts")
