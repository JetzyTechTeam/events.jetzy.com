import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { Events } from "@/models/events"
import { Notifications } from "@/models/events/notifications"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
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

		const { postId } = req.query

		if (!postId) {
			return sendResponse(res, null, "Post ID is required", false, ResCode.BAD_REQUEST)
		}

		// Fetch post
		const post = await DiscussionPosts.findById(postId)
		if (!post) {
			return sendResponse(res, null, "Discussion post not found", false, ResCode.NOT_FOUND)
		}

		// Check permission (must be author or event creator)
		const userId = (session.user as any)?._id
		const isAuthor = post.userId.toString() === userId

		const event = await Events.findById(post.eventId)
		const isEventCreator = event?.createdBy?.toString() === userId

		if (!isAuthor && !isEventCreator) {
			return sendResponse(res, null, "You don't have permission to delete this post", false, ResCode.FORBIDDEN)
		}

		// Delete all comments related to this post
		await DiscussionComments.deleteMany({ discussionPostId: postId })

		// Delete all notifications related to this post
		await Notifications.deleteMany({ sourcePostId: postId })

		// Delete the post
		await DiscussionPosts.findByIdAndDelete(postId)

		return sendResponse(res, null, "Discussion post deleted successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error deleting discussion post:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
