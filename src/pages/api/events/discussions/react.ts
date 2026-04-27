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

        const post = await DiscussionPosts.findById(postId).lean()
        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        // @ts-ignore
        const reactionIds = (post.reactions?.[reactionType] || []) as any[]
        const alreadyReacted = reactionIds.some((id: any) => id.toString() === userId.toString())

        if (alreadyReacted) {
            await DiscussionPosts.findByIdAndUpdate(postId, {
                $pull: { [`reactions.${reactionType}`]: userId },
            })
        } else {
            await DiscussionPosts.findByIdAndUpdate(postId, {
                $addToSet: { [`reactions.${reactionType}`]: userId },
            })

            // Trigger notification for 'like' reactions
            if (reactionType === "like") {
                ; (async () => {
                    try {
                        const postDoc = await DiscussionPosts.findById(postId)
                            .populate("userId", "firstName lastName email")
                        if (!postDoc) return
                        const authorUser = postDoc.userId as any

                        // Don't notify if reacting to own post
                        if (authorUser._id.toString() === userId.toString()) return

                        const event = await Events.findById(postDoc.eventId)
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
                            postId: postDoc._id.toString(),
                        })
                    } catch (error) {
                        console.error("Failed to send reaction notification:", error)
                    }
                })()
            }
        }

        const updated = await DiscussionPosts.findById(postId)
            .populate("userId", "firstName lastName image email")

        return sendResponse(res, updated, "Reaction updated successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error reacting to discussion post:", error)
        return sendResponse(res, null, error.message || "Failed to update reaction.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
