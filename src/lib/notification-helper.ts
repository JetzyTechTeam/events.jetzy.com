import { EventNotifications, NotificationType, INotification } from "@/models/notification"
import { Types } from "mongoose"
import { connectDB } from "./connect-db"

interface CreateNotificationParams {
	userId: string | Types.ObjectId
	type: NotificationType
	title: string
	message: string
	resourceId?: string | Types.ObjectId
	resourceType?: "event" | "booking" | "group" | "comment"
	metadata?: Record<string, any>
}

/**
 * Create a notification for a user
 */
export async function createNotification(params: CreateNotificationParams): Promise<INotification | null> {
	try {
		// Ensure database connection
		await connectDB()
		
		console.log("[createNotification] Creating notification:", {
			userId: params.userId,
			type: params.type,
			title: params.title
		})
		
		const notification = await EventNotifications.create({
			userId: params.userId,
			type: params.type,
			title: params.title,
			message: params.message,
			resourceId: params.resourceId,
			resourceType: params.resourceType,
			metadata: params.metadata,
			isRead: false,
		})

		console.log("[createNotification] ✅ Notification created successfully:", notification._id)
		return notification
	} catch (error) {
		console.error("[createNotification] ❌ Error creating notification:", error)
		console.error("[createNotification] Error details:", error instanceof Error ? error.message : "Unknown error")
		return null
	}
}

/**
 * Create event invitation notification
 */
export async function createEventInvitationNotification(userId: string | Types.ObjectId, eventId: string | Types.ObjectId, eventName: string, inviterName?: string) {
	return createNotification({
		userId,
		type: "event_invitation",
		title: "Event Invitation",
		message: inviterName ? `${inviterName} invited you to ${eventName}` : `You've been invited to ${eventName}`,
		resourceId: eventId,
		resourceType: "event",
		metadata: { eventName, inviterName },
	})
}

/**
 * Create waiting list approval notification
 */
export async function createWaitingListApprovalNotification(userId: string | Types.ObjectId, eventId: string | Types.ObjectId, eventName: string) {
	return createNotification({
		userId,
		type: "waiting_list_approved",
		title: "Waiting List Approved",
		message: `You've been approved from the waiting list for ${eventName}. You can now book your tickets.`,
		resourceId: eventId,
		resourceType: "event",
		metadata: { eventName },
	})
}

/**
 * Create booking confirmation notification
 */
export async function createBookingConfirmationNotification(userId: string | Types.ObjectId, bookingId: string | Types.ObjectId, eventName: string, bookingRef: string) {
	return createNotification({
		userId,
		type: "booking_confirmation",
		title: "Booking Confirmed",
		message: `Your booking for ${eventName} has been confirmed. Reference: ${bookingRef}`,
		resourceId: bookingId,
		resourceType: "booking",
		metadata: { eventName, bookingRef },
	})
}

/**
 * Create event update notification
 */
export async function createEventUpdateNotification(userId: string | Types.ObjectId, eventId: string | Types.ObjectId, eventName: string, updateMessage: string) {
	return createNotification({
		userId,
		type: "event_update",
		title: "Event Update",
		message: `${eventName}: ${updateMessage}`,
		resourceId: eventId,
		resourceType: "event",
		metadata: { eventName, updateMessage },
	})
}

/**
 * Create event comment notification
 */
export async function createEventCommentNotification(userId: string | Types.ObjectId, eventId: string | Types.ObjectId, eventName: string, commenterName: string) {
	return createNotification({
		userId,
		type: "event_comment",
		title: "New Comment",
		message: `${commenterName} commented on ${eventName}`,
		resourceId: eventId,
		resourceType: "comment",
		metadata: { eventName, commenterName },
	})
}

/**
 * Create group invitation notification
 */
export async function createGroupInvitationNotification(userId: string | Types.ObjectId, eventId: string | Types.ObjectId, groupName: string, inviterName?: string) {
	return createNotification({
		userId,
		type: "group_invitation",
		title: "Group Invitation",
		message: inviterName ? `${inviterName} invited you to join ${groupName}` : `You've been invited to join ${groupName}`,
		resourceId: eventId,
		resourceType: "group",
		metadata: { groupName, inviterName },
	})
}

/**
 * Create event reminder notification
 */
export async function createEventReminderNotification(userId: string | Types.ObjectId, eventId: string | Types.ObjectId, eventName: string, startsOn: Date) {
	return createNotification({
		userId,
		type: "event_reminder",
		title: "Event Reminder",
		message: `${eventName} is coming up soon!`,
		resourceId: eventId,
		resourceType: "event",
		metadata: { eventName, startsOn },
	})
}

/**
 * Create admin alert notification
 */
export async function createAdminAlertNotification(userId: string | Types.ObjectId, title: string, message: string, metadata?: Record<string, any>) {
	return createNotification({
		userId,
		type: "admin_alert",
		title,
		message,
		metadata,
	})
}

/**
 * Bulk create notifications for multiple users
 */
export async function createBulkNotifications(userIds: (string | Types.ObjectId)[], notificationData: Omit<CreateNotificationParams, "userId">): Promise<any[]> {
	try {
		const notifications = await EventNotifications.insertMany(
			userIds.map((userId) => ({
				userId,
				type: notificationData.type,
				title: notificationData.title,
				message: notificationData.message,
				resourceId: notificationData.resourceId,
				resourceType: notificationData.resourceType,
				metadata: notificationData.metadata,
				isRead: false,
			})),
		)

		return notifications as any[]
	} catch (error) {
		console.error("[Bulk Create Notifications Error]:", error)
		return []
	}
}
