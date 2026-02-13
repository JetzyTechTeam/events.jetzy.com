import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to delete a post.", false, ResCode.UNAUTHORIZED)
        }

        const { postId } = req.query
        if (!postId) {
            return sendResponse(res, null, "Post ID is required.", false, ResCode.BAD_REQUEST)
        }

        const post = await DiscussionPosts.findById(postId)
        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        // Check ownership or admin status
        // @ts-ignore
        const userId = session.user._id
        // @ts-ignore
        const userRole = session.user.role

        if (post.userId.toString() !== userId.toString() && userRole !== "admin" && userRole !== "super admin") {
            return sendResponse(res, null, "You are not authorized to delete this post.", false, ResCode.FORBIDDEN)
        }

        await DiscussionPosts.findByIdAndDelete(postId)

        // Delete associated comments
        await DiscussionComments.deleteMany({ discussionPostId: postId })

        return sendResponse(res, null, "Post deleted successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error deleting discussion post:", error)
        return sendResponse(res, null, error.message || "Failed to delete post.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
