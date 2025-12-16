import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import "@/models/userModal" // Import Users model to register it with Mongoose
import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { postId } = req.query

		if (!postId) {
			return sendResponse(res, null, "Post ID is required", false, ResCode.BAD_REQUEST)
		}

		// Fetch post
		const post = await DiscussionPosts.findById(postId)
			.populate({
				path: "userId",
				select: "firstName lastName email",
			})
			.lean()
			.exec()

		if (!post) {
			return sendResponse(res, null, "Discussion post not found", false, ResCode.NOT_FOUND)
		}

		// Increment view count
		await DiscussionPosts.findByIdAndUpdate(postId, { $inc: { viewCount: 1 } })

		return sendResponse(res, post, "Discussion post fetched successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error fetching discussion post:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
