import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()

    try {
        const { postId, reactionType } = req.query

        if (!postId) {
            return sendResponse(res, null, "Post ID is required.", false, ResCode.BAD_REQUEST)
        }

        if (!reactionType || (reactionType !== "like" && reactionType !== "helpful")) {
            return sendResponse(res, null, "Valid reaction type (like or helpful) is required.", false, ResCode.BAD_REQUEST)
        }

        const post = await DiscussionPosts.findById(postId)
            .populate(`reactions.${reactionType}`, "firstName lastName image email")
            .lean()

        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        // @ts-ignore
        const users = post.reactions[reactionType] || []

        return sendResponse(res, users, "Users fetched successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error fetching reactions:", error)
        return sendResponse(res, null, error.message || "Failed to fetch reactions.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
