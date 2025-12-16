import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

export type NotificationType = "new_post" | "post_comment" | "comment_reply" | "mention" | "like" | "helpful"

export interface INotification {
	_id?: string
	userId: Schema.Types.ObjectId
	eventId: Schema.Types.ObjectId
	type: NotificationType
	sourceUserId: Schema.Types.ObjectId
	sourcePostId?: Schema.Types.ObjectId
	sourceCommentId?: Schema.Types.ObjectId
	message: string
	isRead: boolean
	createdAt?: Date
	updatedAt?: Date
}

const notificationSchema = new Schema<INotification>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Users",
			index: true,
		},
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Events",
			index: true,
		},
		type: {
			type: String,
			required: true,
			enum: ["new_post", "post_comment", "comment_reply", "mention", "like", "helpful"],
		},
		sourceUserId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Users",
		},
		sourcePostId: {
			type: Schema.Types.ObjectId,
			ref: "DiscussionPosts",
		},
		sourceCommentId: {
			type: Schema.Types.ObjectId,
			ref: "DiscussionComments",
		},
		message: {
			type: String,
			required: true,
		},
		isRead: {
			type: Boolean,
			default: false,
			index: true,
		},
	},
	{
		timestamps: true,
	}
)

// Indexes for better query performance
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 })

export const Notifications: Model<INotification> =
	dbconn.models["Notifications"] || dbconn.model("Notifications", notificationSchema, "notifications")
