import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
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

		const { commentId, newComment, images } = req.body

		if (!commentId || !newComment?.trim()) {
			return sendResponse(res, null, "Comment ID and new comment text are required", false, ResCode.BAD_REQUEST)
		}

		// Fetch comment
		const comment = await DiscussionComments.findById(commentId)
		if (!comment) {
			return sendResponse(res, null, "Comment not found", false, ResCode.NOT_FOUND)
		}

		// Check permission (must be author)
		const userId = (session.user as any)?._id
		if (comment.userId.toString() !== userId) {
			return sendResponse(res, null, "You can only edit your own comments", false, ResCode.FORBIDDEN)
		}

		// Update comment
		const updateData: any = {
			comment: newComment.trim(),
			isEdited: true,
			editedAt: new Date(),
		}

		if (images !== undefined) {
			updateData.images = images
		}

		const updatedComment = await DiscussionComments.findByIdAndUpdate(commentId, updateData, { new: true }).populate({
			path: "userId",
			select: "firstName lastName email",
		})

		return sendResponse(res, updatedComment, "Comment updated successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error editing comment:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
