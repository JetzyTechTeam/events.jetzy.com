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

		const { discussionPostId, comment, images } = req.body

		if (!discussionPostId || !comment?.trim()) {
			return sendResponse(res, null, "Discussion post ID and comment are required", false, ResCode.BAD_REQUEST)
		}

		// Fetch post
		const post = await DiscussionPosts.findById(discussionPostId)
		if (!post) {
			return sendResponse(res, null, "Discussion post not found", false, ResCode.NOT_FOUND)
		}

		// Check if post is locked
		if (post.isLocked) {
			return sendResponse(res, null, "This discussion is locked and cannot accept new comments", false, ResCode.FORBIDDEN)
		}

		const userId = (session.user as any)?._id

		// Create comment
		const newComment = await DiscussionComments.create({
			eventId: post.eventId,
			discussionPostId,
			userId,
			comment: comment.trim(),
			images: images || [],
			parentCommentId: null,
			reactions: { likes: [] },
			isEdited: false,
			isDeleted: false,
		})

		// Update post comment count and last activity
		await DiscussionPosts.findByIdAndUpdate(discussionPostId, {
			$inc: { commentCount: 1 },
			lastActivityAt: new Date(),
		})

		// Populate user info
		const populatedComment = await DiscussionComments.findById(newComment._id).populate({
			path: "userId",
			select: "firstName lastName email",
		})

		// Create notification for post author (if not commenting on own post)
		if (post.userId.toString() !== userId) {
			await Notifications.create({
				userId: post.userId,
				eventId: post.eventId,
				type: "post_comment",
				sourceUserId: userId,
				sourcePostId: discussionPostId,
				sourceCommentId: newComment._id,
				message: `${session.user?.name || session.user?.email} commented on your post "${post.title}"`,
				isRead: false,
			})
		}

		return sendResponse(res, populatedComment, "Comment created successfully", true, ResCode.CREATED)
	} catch (error: any) {
		console.error("Error creating comment:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
