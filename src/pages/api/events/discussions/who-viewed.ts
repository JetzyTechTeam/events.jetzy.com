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

        const post = await DiscussionPosts.findById(postId)
            .populate("viewedBy", "firstName lastName image email")
            .lean()

        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        const viewers = post.viewedBy || []

        return sendResponse(res, viewers, "Viewers fetched successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error fetching viewers:", error)
        return sendResponse(res, null, error.message || "Failed to fetch viewers.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
