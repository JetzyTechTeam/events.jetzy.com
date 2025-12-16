import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "DELETE") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	const session = await getServerSession(req, res, authOptions)

	try {
		if (!session) {
			return sendResponse(res, null, "You need to be logged in", false, ResCode.UNAUTHORIZED)
		}

		const { commentId } = req.query

		if (!commentId) {
			return sendResponse(res, null, "Comment ID is required", false, ResCode.BAD_REQUEST)
		}

		// Fetch comment
		const comment = await DiscussionComments.findById(commentId)
		if (!comment) {
			return sendResponse(res, null, "Comment not found", false, ResCode.NOT_FOUND)
		}

		// Check permission (must be author or event creator)
		const userId = (session.user as any)?._id
		const isAuthor = comment.userId.toString() === userId

		const post = await DiscussionPosts.findById(comment.discussionPostId)
		const event = await Events.findById(comment.eventId)
		const isEventCreator = event?.createdBy?.toString() === userId

		if (!isAuthor && !isEventCreator) {
			return sendResponse(res, null, "You don't have permission to delete this comment", false, ResCode.FORBIDDEN)
		}

		// Count replies to this comment
		const replyCount = await DiscussionComments.countDocuments({
			parentCommentId: commentId,
			isDeleted: false,
		})

		// Soft delete the comment
		await DiscussionComments.findByIdAndUpdate(commentId, {
			isDeleted: true,
			comment: "[deleted]",
		})

		// Update post comment count (subtract 1 + replies)
		await DiscussionPosts.findByIdAndUpdate(comment.discussionPostId, {
			$inc: { commentCount: -(1 + replyCount) },
		})

		// Soft delete all replies
		await DiscussionComments.updateMany(
			{ parentCommentId: commentId },
			{
				isDeleted: true,
				comment: "[deleted]",
			}
		)

		return sendResponse(res, null, "Comment deleted successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error deleting comment:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
