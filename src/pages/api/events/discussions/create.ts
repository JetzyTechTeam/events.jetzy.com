import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { Events } from "@/models/events"
import { Notifications } from "@/models/events/notifications"
import { Bookings } from "@/models/events/bookings"
import { EventInvitation } from "@/models/events/event-invitations"
import "@/models/userModal" // Import Users model to register it with Mongoose
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	const session = await getServerSession(req, res, authOptions)

	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[discussions/create] Database not connected, attempting to connect...")
			await dbconn.asPromise()
		}

		if (!session) {
			return sendResponse(res, null, "You need to be logged in", false, ResCode.UNAUTHORIZED)
		}

		const { eventId, title, content, images, tags } = req.body

		console.log("[discussions/create] Request data:", { 
			eventId, 
			title, 
			content: content?.trim() || "(empty)",
			userId: (session.user as any)?._id,
			images: images,
			imagesCount: images?.length || 0,
			tags: tags
		})

		// Validate: eventId and title are required
		// Content is optional if images are provided
		if (!eventId || !title?.trim()) {
			return sendResponse(res, null, "Event ID and title are required", false, ResCode.BAD_REQUEST)
		}

		// Require either content or images
		const hasContent = content?.trim() && content.trim().length > 0
		const hasImages = images && Array.isArray(images) && images.length > 0
		
		if (!hasContent && !hasImages) {
			return sendResponse(res, null, "Post must have either content or images", false, ResCode.BAD_REQUEST)
		}

		// Verify event exists
		const event = await Events.findById(eventId)
		if (!event) {
			console.log("[discussions/create] Event not found:", eventId)
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		console.log("[discussions/create] Event found:", event.name)

		// Check if user has permission
		const userId = (session.user as any)?._id
		
		// For now, allow any logged-in user to post
		// You can add stricter permissions later if needed
		// const isAttendee = await Bookings.findOne({
		// 	eventId,
		// 	userId,
		// 	isDeleted: false,
		// })
		// const isInvited = await EventInvitation.findOne({
		// 	eventId,
		// 	email: session.user?.email,
		// })

		// Create discussion post
		// Content can be empty if images are provided
		const discussionPost = await DiscussionPosts.create({
			eventId,
			userId,
			title: title.trim(),
			content: content?.trim() || "",
			images: images || [],
			tags: tags || [],
			isPinned: false,
			isLocked: false,
			reactions: { likes: [], helpful: [] },
			viewCount: 0,
			commentCount: 0,
			lastActivityAt: new Date(),
		})

		console.log("[discussions/create] Discussion post created:", discussionPost._id)

		// Populate user info
		const populatedPost = await DiscussionPosts.findById(discussionPost._id).populate({
			path: "userId",
			select: "firstName lastName email",
		})

		console.log("[discussions/create] Post populated, returning to client")

		// Create notifications for all attendees/invited (except the author)
		try {
			const attendees = await Bookings.find({ eventId, isDeleted: false }).distinct("userId")
			const invited = await EventInvitation.find({ eventId }).distinct("userId")
			const allUsers = [...new Set([...attendees.map(String), ...invited.map(String)])].filter((id) => id !== userId)

			if (allUsers.length > 0) {
				const notifications = allUsers.map((recipientId) => ({
					userId: recipientId,
					eventId,
					type: "new_post" as const,
					sourceUserId: userId,
					sourcePostId: discussionPost._id,
					message: `${session.user?.name || session.user?.email} posted: "${title.trim()}"`,
					isRead: false,
				}))

				await Notifications.insertMany(notifications)
			}
		} catch (notifError) {
			console.error("Error creating notifications:", notifError)
			// Don't fail the request if notifications fail
		}

		return sendResponse(res, populatedPost, "Discussion post created successfully", true, ResCode.CREATED)
	} catch (error: any) {
		console.error("Error creating discussion post:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
