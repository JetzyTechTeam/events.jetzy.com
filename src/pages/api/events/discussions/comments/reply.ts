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
import { Bookings } from "@/models/events/bookings"
import { generateMagicToken } from "@/lib/magicLink"
import { sendCommentNotification, sendTagNotification } from "@/lib/send-grid"

const schema = zod.object({
    commentId: zod.string().nonempty(),
    reply: zod.string().nonempty(),
    images: zod.array(zod.string()).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in to reply.", false, ResCode.UNAUTHORIZED)
        }

        const body = req.body
        const validation = schema.safeParse(body)

        if (!validation.success) {
            console.error("Validation error:", validation.error.errors)
            return sendResponse(res, validation.error.errors, "Invalid input data.", false, ResCode.BAD_REQUEST)
        }

        const { commentId, reply, images } = validation.data
        // @ts-ignore
        const userId = session.user._id

        // Find the parent comment
        const parentComment = await DiscussionComments.findById(commentId)
        if (!parentComment) {
            return sendResponse(res, null, "Parent comment not found.", false, ResCode.NOT_FOUND)
        }

        // Find the post
        const post = await DiscussionPosts.findById(parentComment.discussionPostId)
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

        // Create the reply as a new comment with parentCommentId set
        const newReply = await DiscussionComments.create({
            eventId: post.eventId,
            discussionPostId: post._id,
            userId,
            comment: reply,
            images: images || [],
            parentCommentId: commentId,
            reactions: {
                likes: [],
            },
            isEdited: false,
            isDeleted: false,
        })

        // Update post comment count
        await DiscussionPosts.findByIdAndUpdate(post._id, { $inc: { commentCount: 1 } })

        // Populate user details
        await newReply.populate("userId", "firstName lastName image email")

            // Trigger notifications in the background
            ; (async () => {
                try {
                    const event = await Events.findById(post.eventId)
                    if (!event) return

                    const replierName = `${(newReply.userId as any).firstName} ${(newReply.userId as any).lastName}`
                    const replierEmail = (newReply.userId as any).email

                    // Fetch all unique participants for this event
                    const participants = await Bookings.find({
                        eventId: post.eventId,
                        isDeleted: false,
                        status: { $in: ['confirmed', 'completed'] }
                    }).select('customerEmail customerName')

                    const uniqueParticipants = new Map<string, string>()
                    participants.forEach(p => {
                        if (p.customerEmail && p.customerEmail.toLowerCase() !== replierEmail.toLowerCase()) {
                            uniqueParticipants.set(p.customerEmail.toLowerCase(), p.customerName)
                        }
                    })

                    // Ensure the post author is notified if they aren't in the bookings
                    await post.populate("userId", "firstName lastName email")
                    const authorEmail = (post.userId as any).email
                    const authorName = `${(post.userId as any).firstName} ${(post.userId as any).lastName}`

                    if (authorEmail && authorEmail.toLowerCase() !== replierEmail.toLowerCase()) {
                        uniqueParticipants.set(authorEmail.toLowerCase(), authorName)
                    }

                    // Also notify the parent comment author
                    await parentComment.populate("userId", "firstName lastName email")
                    const parentAuthorEmail = (parentComment.userId as any).email
                    const parentAuthorName = `${(parentComment.userId as any).firstName} ${(parentComment.userId as any).lastName}`

                    if (parentAuthorEmail && parentAuthorEmail.toLowerCase() !== replierEmail.toLowerCase()) {
                        uniqueParticipants.set(parentAuthorEmail.toLowerCase(), parentAuthorName)
                    }

                    // Detect mentions: @[Name](id) or @ [Name](id)
                    const mentionRegex = /@\s?\[([^\]]+)\]\(([^)]+)\)/g
                    const mentionedUserIds = new Set<string>()
                    let match
                    while ((match = mentionRegex.exec(reply || "")) !== null) {
                        const idOrEmail = match[2];
                        mentionedUserIds.add(idOrEmail)

                        // If it looks like an email and isn't in our list yet, add it
                        if (idOrEmail.includes('@') && idOrEmail.includes('.')) {
                            const email = idOrEmail.toLowerCase();
                            if (!uniqueParticipants.has(email) && email !== replierEmail.toLowerCase()) {
                                uniqueParticipants.set(email, "Friend"); // Default name for external emails
                            }
                        }
                    }

                    console.log(`[Notification] Processing reply alerts for ${uniqueParticipants.size} people`)

                    for (const [email, name] of uniqueParticipants.entries()) {
                        const firstName = name.split(' ')[0] || 'Friend'
                        const lastName = name.split(' ').slice(1).join(' ') || ''
                        const magicToken = generateMagicToken({ email, firstName, lastName })

                        // If user is mentioned, send tag notification
                        if (mentionedUserIds.has(email)) {
                            console.log(`[Notification] Sending tag alert (reply) to: ${email}`)
                            await sendTagNotification({
                                email,
                                firstName,
                                lastName,
                                authorName: replierName,
                                eventName: event.name,
                                eventSlug: event.slug,
                                magicToken,
                                postId: post._id.toString()
                            })
                        } else {
                            // Otherwise send standard comment notification
                            await sendCommentNotification({
                                email,
                                firstName,
                                lastName,
                                commenterName: replierName,
                                eventName: event.name,
                                eventSlug: event.slug,
                                magicToken,
                                postId: post._id.toString()
                            })
                        }
                    }
                } catch (notifyError) {
                    console.error("[Notification] Failed to send reply alerts:", notifyError)
                }
            })()

        return sendResponse(res, newReply, "Reply created successfully.", true, ResCode.CREATED)
    } catch (error: any) {
        console.error("Error creating reply:", error)
        return sendResponse(res, null, error.message || "Failed to create reply.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
