import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { Notifications } from "@/models/events/notifications"
import "@/models/userModal" // Import Users model to register it with Mongoose
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	const session = await getServerSession(req, res, authOptions)

	try {
		if (!session) {
			return sendResponse(res, null, "You need to be logged in", false, ResCode.UNAUTHORIZED)
		}

		const { commentId, reply, images } = req.body

		if (!commentId || !reply?.trim()) {
			return sendResponse(res, null, "Comment ID and reply are required", false, ResCode.BAD_REQUEST)
		}

		// Fetch parent comment
		const parentComment = await DiscussionComments.findById(commentId)
		if (!parentComment) {
			return sendResponse(res, null, "Parent comment not found", false, ResCode.NOT_FOUND)
		}

		// Check if post is locked
		const post = await DiscussionPosts.findById(parentComment.discussionPostId)
		if (post?.isLocked) {
			return sendResponse(res, null, "This discussion is locked and cannot accept new replies", false, ResCode.FORBIDDEN)
		}

		const userId = (session.user as any)?._id

		// Create reply
		const newReply = await DiscussionComments.create({
			eventId: parentComment.eventId,
			discussionPostId: parentComment.discussionPostId,
			userId,
			comment: reply.trim(),
			images: images || [],
			parentCommentId: commentId,
			reactions: { likes: [] },
			isEdited: false,
			isDeleted: false,
		})

		// Update post comment count and last activity
		await DiscussionPosts.findByIdAndUpdate(parentComment.discussionPostId, {
			$inc: { commentCount: 1 },
			lastActivityAt: new Date(),
		})

		// Populate user info
		const populatedReply = await DiscussionComments.findById(newReply._id).populate({
			path: "userId",
			select: "firstName lastName email",
		})

		// Create notification for parent comment author (if not replying to own comment)
		if (parentComment.userId.toString() !== userId) {
			await Notifications.create({
				userId: parentComment.userId,
				eventId: parentComment.eventId,
				type: "comment_reply",
				sourceUserId: userId,
				sourcePostId: parentComment.discussionPostId,
				sourceCommentId: newReply._id,
				message: `${session.user?.name || session.user?.email} replied to your comment`,
				isRead: false,
			})
		}

		return sendResponse(res, populatedReply, "Reply created successfully", true, ResCode.CREATED)
	} catch (error: any) {
		console.error("Error creating reply:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
