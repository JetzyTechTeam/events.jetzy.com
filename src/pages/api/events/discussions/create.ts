import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import zod from "zod"

const schema = zod.object({
    eventId: zod.string().nonempty(),
    title: zod.string().nonempty(),
    content: zod.string().optional(),
    tags: zod.array(zod.string()).optional(),
    images: zod.array(zod.string()).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to create a post.", false, ResCode.UNAUTHORIZED)
        }

        const body = req.body
        console.log("[API] Create Post Body:", JSON.stringify(body, null, 2))

        const validation = schema.safeParse(body)

        if (!validation.success) {
            console.error("[API] Validation Error:", validation.error)
            return sendResponse(res, validation.error.errors, "Invalid input data.", false, ResCode.BAD_REQUEST)
        }

        const { eventId, title, content, tags, images } = validation.data
        console.log("[API] Parsed Data - Images:", images)
        // @ts-ignore
        const userId = session.user._id

        const newPost = await DiscussionPosts.create({
            eventId,
            userId,
            title,
            content: content || "",
            tags: tags || [],
            images: images || [],
            reactions: {
                likes: [],
                helpful: [],
            },
            viewCount: 0,
            commentCount: 0,
            lastActivityAt: new Date(),
        })

        // Populate user details for immediate display
        await newPost.populate("userId", "firstName lastName image email")

        return sendResponse(res, newPost, "Post created successfully.", true, ResCode.CREATED)
    } catch (error: any) {
        console.error("Error creating discussion post:", error)
        return sendResponse(res, null, error.message || "Failed to create post.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
