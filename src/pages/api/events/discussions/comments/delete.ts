import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to delete a comment.", false, ResCode.UNAUTHORIZED)
        }

        const { commentId } = req.query
        if (!commentId) {
            return sendResponse(res, null, "Comment ID is required.", false, ResCode.BAD_REQUEST)
        }

        const comment = await DiscussionComments.findById(commentId)
        if (!comment) {
            return sendResponse(res, null, "Comment not found.", false, ResCode.NOT_FOUND)
        }

        // @ts-ignore
        const userId = session.user._id
        // @ts-ignore
        const userRole = session.user.role

        // Check if user is author or admin
        if (comment.userId.toString() !== userId.toString() && userRole !== "admin" && userRole !== "super admin") {
            return sendResponse(res, null, "You are not authorized to delete this comment.", false, ResCode.FORBIDDEN)
        }

        // Soft delete or hard delete?
        // Staging logic usually does soft delete for comments to keep threading?
        // For now, let's do hard delete to match post delete logic, but updating parent pointers might be needed.
        // Actually, DiscussionPostView handles isDeleted flag. Let's use soft delete.

        comment.isDeleted = true
        comment.comment = "[Comment deleted]" // Or just flag it
        await comment.save()

        // Optional: Decrement comment count on post (if hard delete)
        // valid choice: keep count or decrement? usually keep if soft delete.

        // If hard delete:
        // await DiscussionComments.findByIdAndDelete(commentId)
        // await DiscussionPosts.findByIdAndUpdate(comment.discussionPostId, { $inc: { commentCount: -1 } })

        return sendResponse(res, null, "Comment deleted successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error deleting discussion comment:", error)
        return sendResponse(res, null, error.message || "Failed to delete comment.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
