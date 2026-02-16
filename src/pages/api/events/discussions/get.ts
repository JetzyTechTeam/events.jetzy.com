import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()

    try {
        const { postId } = req.query

        if (!postId) {
            return sendResponse(res, null, "Post ID is required.", false, ResCode.BAD_REQUEST)
        }

        const post = await DiscussionPosts.findByIdAndUpdate(postId, { $inc: { viewCount: 1 } }, { new: true }).populate("userId", "firstName lastName image email").lean()

        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        return sendResponse(res, post, "Post fetched successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error fetching discussion post:", error)
        return sendResponse(res, null, error.message || "Failed to fetch post.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
