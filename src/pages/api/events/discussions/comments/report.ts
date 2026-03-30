import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to report a comment.", false, ResCode.UNAUTHORIZED)
        }

        if (req.method !== "POST") {
            return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
        }

        const { commentId } = req.body
        if (!commentId) {
            return sendResponse(res, null, "Comment ID is required.", false, ResCode.BAD_REQUEST)
        }

        const comment = await DiscussionComments.findById(commentId)
        if (!comment) {
            return sendResponse(res, null, "Comment not found.", false, ResCode.NOT_FOUND)
        }

        comment.isReported = true
        await comment.save()

        return sendResponse(res, null, "Comment reported and hidden successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error reporting discussion comment:", error)
        return sendResponse(res, null, error.message || "Failed to report comment.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
