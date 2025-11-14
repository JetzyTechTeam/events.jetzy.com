import { dbconn } from "@/configs/database"
import { Model, Schema, Types } from "mongoose"

export type NotificationType = "event_invitation" | "waiting_list_approved" | "booking_confirmation" | "event_update" | "event_comment" | "group_invitation" | "event_reminder" | "admin_alert"

export interface INotification extends Document {
	userId: Types.ObjectId
	type: NotificationType
	title: string
	message: string
	resourceId?: Types.ObjectId // Event ID, Booking ID, etc.
	resourceType?: "event" | "booking" | "group" | "comment"
	isRead: boolean
	createdAt: Date
	metadata?: Record<string, any> // Additional data for specific notification types
}

const notificationSchema = new Schema<INotification>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Users",
			index: true,
		},
		type: {
			type: String,
			required: true,
			enum: ["event_invitation", "waiting_list_approved", "booking_confirmation", "event_update", "event_comment", "group_invitation", "event_reminder", "admin_alert"],
		},
		title: {
			type: String,
			required: true,
		},
		message: {
			type: String,
			required: true,
		},
		resourceId: {
			type: Schema.Types.ObjectId,
			required: false,
		},
		resourceType: {
			type: String,
			enum: ["event", "booking", "group", "comment"],
			required: false,
		},
		isRead: {
			type: Boolean,
			default: false,
			index: true,
		},
		metadata: {
			type: Schema.Types.Mixed,
			required: false,
		},
	},
	{
		timestamps: true,
	},
)

// Compound index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 })

export const EventNotifications: Model<INotification> = dbconn.models["EventNotifications"] || dbconn.model<INotification>("EventNotifications", notificationSchema, "eventnotifications")
