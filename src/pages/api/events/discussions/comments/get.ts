import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { ensureDbConnected } from "@/configs/database"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()

    try {
        const { postId } = req.query

        if (!postId) {
            return sendResponse(res, null, "Post ID is required.", false, ResCode.BAD_REQUEST)
        }

        const comments = await DiscussionComments.find({ discussionPostId: postId, isDeleted: false, isReported: { $ne: true } })
            .sort({ createdAt: 1 }) // Chronological order
            .populate("userId", "firstName lastName image email")
            .lean()

        return sendResponse(res, comments, "Comments fetched successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error fetching discussion comments:", error)
        return sendResponse(res, null, error.message || "Failed to fetch comments.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
