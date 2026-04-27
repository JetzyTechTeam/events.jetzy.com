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

        const comment = await DiscussionComments.findById(commentId).lean()
        if (!comment) {
            return sendResponse(res, null, "Comment not found.", false, ResCode.NOT_FOUND)
        }

        const likesArray = (comment.reactions?.likes || (comment.reactions as any)?.like || []) as any[]
        const alreadyLiked = likesArray.some((id: any) => id.toString() === userId.toString())

        if (alreadyLiked) {
            await DiscussionComments.findByIdAndUpdate(commentId, {
                $pull: { "reactions.likes": userId },
            })
        } else {
            await DiscussionComments.findByIdAndUpdate(commentId, {
                $addToSet: { "reactions.likes": userId },
            })
        }

        const updated = await DiscussionComments.findById(commentId)
            .populate("userId", "firstName lastName image email")

        return sendResponse(res, updated, "Reaction updated successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error reacting to comment:", error)
        return sendResponse(res, null, error.message || "Failed to update reaction.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
