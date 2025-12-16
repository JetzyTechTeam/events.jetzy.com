import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionComments } from "@/models/events/discussion-comments"
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

		// Fetch all comments for this post (including replies)
		const comments = await DiscussionComments.find({
			discussionPostId: postId,
			isDeleted: false,
		})
			.populate({
				path: "userId",
				select: "firstName lastName email",
			})
			.sort({ createdAt: 1 })
			.lean()
			.exec()

		return sendResponse(res, comments, "Comments fetched successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error fetching comments:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
