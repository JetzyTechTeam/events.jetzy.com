import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "PUT") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	const session = await getServerSession(req, res, authOptions)

	try {
		if (!session) {
			return sendResponse(res, null, "You need to be logged in", false, ResCode.UNAUTHORIZED)
		}

		const { postId, title, content, images, tags } = req.body

		console.log("📥 Update post request:", { postId, title, content, imagesCount: images?.length, tags })
		console.log("📸 Images received:", images)

		if (!postId) {
			return sendResponse(res, null, "Post ID is required", false, ResCode.BAD_REQUEST)
		}

		// Fetch post
		const post = await DiscussionPosts.findById(postId)
		if (!post) {
			return sendResponse(res, null, "Discussion post not found", false, ResCode.NOT_FOUND)
		}

		// Check permission (must be author only)
		const userId = (session.user as any)?._id
		const isAuthor = post.userId.toString() === userId

		if (!isAuthor) {
			return sendResponse(res, null, "You don't have permission to edit this post. You can only edit your own posts.", false, ResCode.FORBIDDEN)
		}

		// Build update object
		const updateData: any = {}
		if (title?.trim()) updateData.title = title.trim()
		if (content?.trim()) updateData.content = content.trim()
		if (images !== undefined) updateData.images = images
		if (tags !== undefined) updateData.tags = tags

		// Update post
		const updatedPost = await DiscussionPosts.findByIdAndUpdate(postId, updateData, { new: true }).populate({
			path: "userId",
			select: "firstName lastName email",
		})

		return sendResponse(res, updatedPost, "Discussion post updated successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error updating discussion post:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
