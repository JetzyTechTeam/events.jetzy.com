import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { ensureDbConnected } from "@/configs/database"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()

    try {
        const { commentId } = req.query

        if (!commentId) {
            return sendResponse(res, null, "Comment ID is required.", false, ResCode.BAD_REQUEST)
        }

        const comment = await DiscussionComments.findById(commentId)
            .populate("reactions.likes", "firstName lastName image email")
            .lean()

        if (!comment) {
            return sendResponse(res, null, "Comment not found.", false, ResCode.NOT_FOUND)
        }

        // Handle both 'likes' and 'like' field names for backward compatibility
        const users = comment.reactions?.likes || (comment.reactions as any)?.like || []

        return sendResponse(res, users, "Users fetched successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error fetching comment reactions:", error)
        return sendResponse(res, null, error.message || "Failed to fetch reactions.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
