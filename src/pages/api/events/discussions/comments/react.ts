import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
import zod from "zod"

const schema = zod.object({
    commentId: zod.string().nonempty(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to react to a comment.", false, ResCode.UNAUTHORIZED)
        }

        const body = req.body
        const validation = schema.safeParse(body)

        if (!validation.success) {
            return sendResponse(res, validation.error.errors, "Invalid input data.", false, ResCode.BAD_REQUEST)
        }

        const { commentId } = validation.data
        // @ts-ignore
        const userId = session.user._id

        const comment = await DiscussionComments.findById(commentId)
        if (!comment) {
            return sendResponse(res, null, "Comment not found.", false, ResCode.NOT_FOUND)
        }

        // Toggle like reaction
        // Handle both 'like' and 'likes' for backward compatibility
        const likesArray = (comment.reactions?.likes || (comment.reactions as any)?.like || []) as any[]
        const existingIndex = likesArray.findIndex((id: any) => id.toString() === userId.toString())

        if (existingIndex > -1) {
            // Remove like
            likesArray.splice(existingIndex, 1)
        } else {
            // Add like
            likesArray.push(userId)
        }

        // Update the likes array (support both field names)
        if (comment.reactions?.likes !== undefined) {
            comment.reactions.likes = likesArray as any
        } else if ((comment.reactions as any)?.like !== undefined) {
            (comment.reactions as any).like = likesArray
        }

        await comment.save()

        // Populate for return
        await comment.populate("userId", "firstName lastName image email")

        return sendResponse(res, comment, "Reaction updated successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error reacting to comment:", error)
        return sendResponse(res, null, error.message || "Failed to update reaction.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
