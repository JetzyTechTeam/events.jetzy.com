import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
import zod from "zod"

const schema = zod.object({
    postId: zod.string().nonempty(),
    content: zod.string().nonempty(),
    images: zod.array(zod.string()).optional(),
    parentCommentId: zod.string().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to comment.", false, ResCode.UNAUTHORIZED)
        }

        const body = req.body
        const validation = schema.safeParse(body)

        if (!validation.success) {
            return sendResponse(res, validation.error.errors, "Invalid input data.", false, ResCode.BAD_REQUEST)
        }

        const { postId, content, images, parentCommentId } = validation.data
        // @ts-ignore
        const userId = session.user._id

        const post = await DiscussionPosts.findById(postId)
        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        const newComment = await DiscussionComments.create({
            eventId: post.eventId,
            discussionPostId: postId,
            userId,
            comment: content,
            images: images || [],
            parentCommentId: parentCommentId || null,
            reactions: {
                likes: [],
            },
            isEdited: false,
            isDeleted: false,
        })

        // Update post comment count
        await DiscussionPosts.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } })

        // Populate user details
        await newComment.populate("userId", "firstName lastName image email")

        return sendResponse(res, newComment, "Comment created successfully.", true, ResCode.CREATED)
    } catch (error: any) {
        console.error("Error creating discussion comment:", error)
        return sendResponse(res, null, error.message || "Failed to create comment.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
