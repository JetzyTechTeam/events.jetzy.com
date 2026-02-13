import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import zod from "zod"

const schema = zod.object({
    postId: zod.string().nonempty(),
    title: zod.string().optional(),
    content: zod.string().optional(),
    tags: zod.array(zod.string()).optional(),
    images: zod.array(zod.string()).optional(),
    isPinned: zod.boolean().optional(),
    isLocked: zod.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to update a post.", false, ResCode.UNAUTHORIZED)
        }

        const body = req.body
        const validation = schema.safeParse(body)

        if (!validation.success) {
            return sendResponse(res, validation.error.errors, "Invalid input data.", false, ResCode.BAD_REQUEST)
        }

        const { postId, title, content, tags, images, isPinned, isLocked } = validation.data

        const post = await DiscussionPosts.findById(postId)
        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        // @ts-ignore
        const userId = session.user._id
        // @ts-ignore
        const userRole = session.user.role

        // Check authorization
        // Only author can update content/title/tags/images
        // Only admin can pin/lock

        const isAuthor = post.userId.toString() === userId.toString()
        const isAdmin = userRole === "admin" || userRole === "super admin"

        if (!isAuthor && !isAdmin) {
            return sendResponse(res, null, "You are not authorized to update this post.", false, ResCode.FORBIDDEN)
        }

        // Update fields if provided and authorized
        if (isAuthor) {
            if (title !== undefined) post.title = title
            if (content !== undefined) post.content = content
            if (tags !== undefined) post.tags = tags
            if (images !== undefined) post.images = images
        }

        if (isAdmin) {
            if (isPinned !== undefined) post.isPinned = isPinned
            if (isLocked !== undefined) post.isLocked = isLocked
        }

        await post.save()
        await post.populate("userId", "firstName lastName image email")

        return sendResponse(res, post, "Post updated successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error updating discussion post:", error)
        return sendResponse(res, null, error.message || "Failed to update post.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
