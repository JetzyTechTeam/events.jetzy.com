import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { generateMagicToken } from "@/lib/magicLink"
import { sendViewMilestoneNotification } from "@/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()

    try {
        const { postId } = req.query

        if (!postId) {
            return sendResponse(res, null, "Post ID is required.", false, ResCode.BAD_REQUEST)
        }

        // Update view count and track viewer
        const post = await DiscussionPosts.findByIdAndUpdate(
            postId,
            {
                $inc: { viewCount: 1 },
                $addToSet: { viewedBy: req.headers['x-user-id'] } // Add user to viewedBy if not already present
            },
            { new: true }
        ).populate("userId", "firstName lastName image email")

        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        // Trigger notifications for milestones
        if (post.viewCount === 10 || post.viewCount === 50) {
            ; (async () => {
                try {
                    const authorUser = post.userId as any
                    if (!authorUser || !authorUser.email) return

                    const event = await Events.findById(post.eventId)
                    if (!event) return

                    const magicToken = await generateMagicToken(authorUser.email)

                    await sendViewMilestoneNotification({
                        email: authorUser.email,
                        firstName: authorUser.firstName,
                        lastName: authorUser.lastName,
                        eventName: event.name,
                        eventSlug: event.slug,
                        magicToken,
                        postId: post._id.toString(),
                        viewCount: post.viewCount,
                    })
                } catch (error) {
                    console.error("Failed to send view milestone notification:", error)
                }
            })()
        }

        return sendResponse(res, post, "Post fetched successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error fetching discussion post:", error)
        return sendResponse(res, null, error.message || "Failed to fetch post.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
