import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import zod from "zod"
import { Events } from "@/models/events"
import { generateMagicToken } from "@/lib/magicLink"
import { sendReactionNotification } from "@/lib/send-grid"

const schema = zod.object({
    postId: zod.string().nonempty(),
    reactionType: zod.enum(["like", "helpful"]),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to react to a post.", false, ResCode.UNAUTHORIZED)
        }

        const body = req.body
        const validation = schema.safeParse(body)

        if (!validation.success) {
            return sendResponse(res, validation.error.errors, "Invalid input data.", false, ResCode.BAD_REQUEST)
        }

        const { postId, reactionType } = validation.data
        // @ts-ignore
        const userId = session.user._id

        const post = await DiscussionPosts.findById(postId)
        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        // Toggle reaction
        // @ts-ignore
        const reactions = post.reactions[reactionType] as any[] // mongoose array
        const existingIndex = reactions.findIndex((id: any) => id.toString() === userId.toString())

        if (existingIndex > -1) {
            // Remove reaction
            reactions.splice(existingIndex, 1)
        } else {
            // Add reaction
            reactions.push(userId)

            // Trigger notification for 'like' reactions
            if (reactionType === "like") {
                ; (async () => {
                    try {
                        const author = await post.populate("userId", "firstName lastName email")
                        const authorUser = author.userId as any

                        // Don't notify if reacting to own post
                        if (authorUser._id.toString() === userId.toString()) return

                        const event = await Events.findById(post.eventId)
                        if (!event) return

                        const reactor = session.user as any
                        const reactorName = reactor.name || reactor.fullName || `${reactor.firstName} ${reactor.lastName}`.trim() || "Someone"
                        const magicToken = await generateMagicToken(authorUser.email)

                        await sendReactionNotification({
                            email: authorUser.email,
                            firstName: authorUser.firstName,
                            lastName: authorUser.lastName,
                            reactorName,
                            eventName: event.name,
                            eventSlug: event.slug,
                            magicToken,
                            postId: post._id.toString(),
                        })
                    } catch (error) {
                        console.error("Failed to send reaction notification:", error)
                    }
                })()
            }
        }

        await post.save()

        // Populate for return
        await post.populate("userId", "firstName lastName image email")

        return sendResponse(res, post, "Reaction updated successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error reacting to discussion post:", error)
        return sendResponse(res, null, error.message || "Failed to update reaction.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
