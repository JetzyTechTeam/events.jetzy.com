import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
import zod from "zod"
import { Events } from "@/models/events"
import { generateMagicToken } from "@/lib/magicLink"
import { sendCommentNotification, sendTagNotification } from "@/lib/send-grid"
import { getEventParticipants } from "@/lib/event-participants"

const schema = zod.object({
    discussionPostId: zod.string().nonempty(),
    comment: zod.string().nonempty(),
    images: zod.array(zod.string()).optional(),
    attachments: zod.array(zod.string()).optional(),
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
            console.error("Validation error:", validation.error.errors)
            return sendResponse(res, validation.error.errors, "Invalid input data.", false, ResCode.BAD_REQUEST)
        }

        const { discussionPostId, comment, images, attachments, parentCommentId } = validation.data
        const postId = discussionPostId
        const content = comment
        // @ts-ignore
        const userId = session.user._id

        const post = await DiscussionPosts.findById(postId)
        if (!post) {
            return sendResponse(res, null, "Post not found.", false, ResCode.NOT_FOUND)
        }

        // Check if user is allowed to comment (participant or host)
        const event = await Events.findById(post.eventId)
        if (!event) {
            return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)
        }

        // Check if user is the host/owner
        const isHost = (event.ownerId && event.ownerId.toString() === userId.toString())

        // if (!isHost) {
        //     // Check if user has a confirmed booking
        //     const booking = await Bookings.findOne({
        //         eventId: post.eventId,
        //         userId: userId,
        //         status: { $in: ['confirmed', 'completed'] },
        //         isDeleted: false
        //     })

        //     if (!booking) {
        //         return sendResponse(res, null, "You must be registered for this event to comment.", false, ResCode.FORBIDDEN)
        //     }
        // }

        const newComment = await DiscussionComments.create({
            eventId: post.eventId,
            discussionPostId: postId,
            userId,
            comment: content,
            images: images || [],
            attachments: attachments || [],
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

            // Trigger notifications in the background
            ; (async () => {
                try {
                    const event = await Events.findById(post.eventId)
                    if (!event) return

                    const commenterName = `${(newComment.userId as any).firstName} ${(newComment.userId as any).lastName}`
                    const commenterEmail = (newComment.userId as any).email

                    // All confirmed bookings + accepted invitations, excluding the commenter
                    const uniqueParticipants = await getEventParticipants(post.eventId.toString(), commenterEmail)

                    // Also ensure the post author is notified even if they have no booking (e.g. admin/host)
                    await post.populate("userId", "firstName lastName email")
                    const authorEmail = (post.userId as any).email?.toLowerCase()
                    const authorName = `${(post.userId as any).firstName} ${(post.userId as any).lastName}`
                    if (authorEmail && authorEmail !== commenterEmail.toLowerCase() && !uniqueParticipants.has(authorEmail)) {
                        uniqueParticipants.set(authorEmail, authorName)
                    }

                    // Detect mentions: @[Name](id) or @[Name](email)
                    const mentionRegex = /@\s?\[([^\]]+)\]\(([^)]+)\)/g
                    const mentionedIds = new Set<string>()
                    let match
                    while ((match = mentionRegex.exec(content || "")) !== null) {
                        const idOrEmail = match[2]
                        mentionedIds.add(idOrEmail)
                        // Add email-style mentions that aren't already in the list
                        if (idOrEmail.includes('@') && idOrEmail.includes('.')) {
                            const email = idOrEmail.toLowerCase()
                            if (!uniqueParticipants.has(email) && email !== commenterEmail.toLowerCase()) {
                                uniqueParticipants.set(email, "Friend")
                            }
                        }
                    }

                    console.log(`[Notification] Processing comment alerts for ${uniqueParticipants.size} people`)

                    const hasImages = !!((newComment.images && newComment.images.length > 0) || (newComment.attachments && newComment.attachments.length > 0))

                    await Promise.all(
                        Array.from(uniqueParticipants.entries()).map(async ([email, name]) => {
                            const firstName = name.split(' ')[0] || 'Friend'
                            const lastName = name.split(' ').slice(1).join(' ') || ''
                            const magicToken = generateMagicToken({ email, firstName, lastName })
                            const isAuthor = email === authorEmail

                            if (mentionedIds.has(email)) {
                                console.log(`[Notification] Sending tag alert (comment) to: ${email}`)
                                await sendTagNotification({
                                    email, firstName, lastName,
                                    authorName: commenterName,
                                    eventName: event.name, eventSlug: event.slug,
                                    magicToken, postId: post._id.toString(), hasImages,
                                })
                            } else {
                                await sendCommentNotification({
                                    email, firstName, lastName, commenterName,
                                    eventName: event.name, eventSlug: event.slug,
                                    magicToken, postId: post._id.toString(), hasImages,
                                    isPostAuthor: isAuthor,
                                })
                            }
                        })
                    )
                } catch (notifyError) {
                    console.error("[Notification] Failed to send comment alerts:", notifyError)
                }
            })()

        return sendResponse(res, newComment, "Comment created successfully.", true, ResCode.CREATED)
    } catch (error: any) {
        console.error("Error creating discussion comment:", error)
        return sendResponse(res, null, error.message || "Failed to create comment.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
