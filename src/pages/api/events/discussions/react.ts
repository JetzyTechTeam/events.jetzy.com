import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { Notifications } from "@/models/events/notifications"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
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

		const { postId, reactionType } = req.body

		if (!postId || !reactionType) {
			return sendResponse(res, null, "Post ID and reaction type are required", false, ResCode.BAD_REQUEST)
		}

		if (!["like", "helpful"].includes(reactionType)) {
			return sendResponse(res, null, "Invalid reaction type", false, ResCode.BAD_REQUEST)
		}

		// Fetch post
		const post = await DiscussionPosts.findById(postId)
		if (!post) {
			return sendResponse(res, null, "Discussion post not found", false, ResCode.NOT_FOUND)
		}

		const userId = (session.user as any)?._id
		const reactionField = reactionType === "like" ? "reactions.likes" : "reactions.helpful"

		// Check if user already reacted
		const hasReacted = post.reactions[reactionType === "like" ? "likes" : "helpful"].includes(userId)

		let updatedPost
		if (hasReacted) {
			// Remove reaction
			updatedPost = await DiscussionPosts.findByIdAndUpdate(postId, { $pull: { [reactionField]: userId } }, { new: true }).populate({
				path: "userId",
				select: "firstName lastName email",
			})
		} else {
			// Add reaction
			updatedPost = await DiscussionPosts.findByIdAndUpdate(postId, { $addToSet: { [reactionField]: userId } }, { new: true }).populate({
				path: "userId",
				select: "firstName lastName email",
			})

			// Create notification for post author (if not reacting to own post)
			if (post.userId.toString() !== userId) {
				await Notifications.create({
					userId: post.userId,
					eventId: post.eventId,
					type: reactionType as "like" | "helpful",
					sourceUserId: userId,
					sourcePostId: postId,
					message: `${session.user?.name || session.user?.email} reacted ${reactionType === "like" ? "👍" : "💡"} to your post "${post.title}"`,
					isRead: false,
				})
			}
		}

		return sendResponse(res, updatedPost, `Reaction ${hasReacted ? "removed" : "added"} successfully`, true, ResCode.OK)
	} catch (error: any) {
		console.error("Error reacting to post:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
