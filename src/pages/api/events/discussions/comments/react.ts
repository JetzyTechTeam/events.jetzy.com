import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { Notifications } from "@/models/events/notifications"
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

		const { commentId } = req.body

		if (!commentId) {
			return sendResponse(res, null, "Comment ID is required", false, ResCode.BAD_REQUEST)
		}

		// Fetch comment
		const comment = await DiscussionComments.findById(commentId)
		if (!comment) {
			return sendResponse(res, null, "Comment not found", false, ResCode.NOT_FOUND)
		}

		const userId = (session.user as any)?._id

		// Check if user already liked
		const hasLiked = comment.reactions.likes.includes(userId)

		let updatedComment
		if (hasLiked) {
			// Remove like
			updatedComment = await DiscussionComments.findByIdAndUpdate(commentId, { $pull: { "reactions.likes": userId } }, { new: true }).populate({
				path: "userId",
				select: "firstName lastName email",
			})
		} else {
			// Add like
			updatedComment = await DiscussionComments.findByIdAndUpdate(commentId, { $addToSet: { "reactions.likes": userId } }, { new: true }).populate({
				path: "userId",
				select: "firstName lastName email",
			})

			// Create notification for comment author (if not liking own comment)
			if (comment.userId.toString() !== userId) {
				await Notifications.create({
					userId: comment.userId,
					eventId: comment.eventId,
					type: "like",
					sourceUserId: userId,
					sourcePostId: comment.discussionPostId,
					sourceCommentId: commentId,
					message: `${session.user?.name || session.user?.email} liked your comment`,
					isRead: false,
				})
			}
		}

		return sendResponse(res, updatedComment, `Like ${hasLiked ? "removed" : "added"} successfully`, true, ResCode.OK)
	} catch (error: any) {
		console.error("Error reacting to comment:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
