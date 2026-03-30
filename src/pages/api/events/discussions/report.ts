import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to report a post.", false, ResCode.UNAUTHORIZED)
        }

        if (req.method !== "POST") {
            return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
        }

        const { postId } = req.body
        if (!postId) {
            return sendResponse(res, null, "Post ID is required.", false, ResCode.BAD_REQUEST)
        }

        const post = await DiscussionPosts.findById(postId)
        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        post.isReported = true
        await post.save()

        return sendResponse(res, null, "Post reported and hidden successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error reporting discussion post:", error)
        return sendResponse(res, null, error.message || "Failed to report post.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
