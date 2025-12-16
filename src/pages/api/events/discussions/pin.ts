import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { Events } from "@/models/events"
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

		const { postId, isPinned } = req.body

		if (!postId || typeof isPinned !== "boolean") {
			return sendResponse(res, null, "Post ID and isPinned status are required", false, ResCode.BAD_REQUEST)
		}

		// Fetch post
		const post = await DiscussionPosts.findById(postId)
		if (!post) {
			return sendResponse(res, null, "Discussion post not found", false, ResCode.NOT_FOUND)
		}

		// Check permission (must be event creator or admin)
		const userId = (session.user as any)?._id
		const event = await Events.findById(post.eventId)
		const isEventCreator = event?.createdBy?.toString() === userId
		const isAdmin = (session.user as any)?.role === "admin"

		if (!isEventCreator && !isAdmin) {
			return sendResponse(res, null, "Only event creators can pin/unpin posts", false, ResCode.FORBIDDEN)
		}

		// Update pin status
		const updatedPost = await DiscussionPosts.findByIdAndUpdate(postId, { isPinned }, { new: true }).populate({
			path: "userId",
			select: "firstName lastName email",
		})

		return sendResponse(res, updatedPost, `Post ${isPinned ? "pinned" : "unpinned"} successfully`, true, ResCode.OK)
	} catch (error: any) {
		console.error("Error pinning/unpinning post:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
