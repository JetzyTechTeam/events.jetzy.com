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
    discussionPostId: zod.string().nonempty(),
    comment: zod.string().nonempty(),
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
            console.error("Validation error:", validation.error.errors)
            return sendResponse(res, validation.error.errors, "Invalid input data.", false, ResCode.BAD_REQUEST)
        }

        const { discussionPostId, comment, images, parentCommentId } = validation.data
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

                    // Fetch all unique participants for this event
                    const participants = await Bookings.find({
                        eventId: post.eventId,
                        isDeleted: false,
                        status: { $in: ['confirmed', 'completed'] }
                    }).select('customerEmail customerName')

                    const uniqueParticipants = new Map<string, string>()
                    participants.forEach(p => {
                        if (p.customerEmail && p.customerEmail.toLowerCase() !== commenterEmail.toLowerCase()) {
                            uniqueParticipants.set(p.customerEmail.toLowerCase(), p.customerName)
                        }
                    })

                    // Also ensure the post author is notified if they aren't in the bookings (e.g. host)
                    // and they aren't the one commenting
                    await post.populate("userId", "firstName lastName email")
                    const authorEmail = (post.userId as any).email
                    const authorName = `${(post.userId as any).firstName} ${(post.userId as any).lastName}`

                    if (authorEmail && authorEmail.toLowerCase() !== commenterEmail.toLowerCase()) {
                        uniqueParticipants.set(authorEmail.toLowerCase(), authorName)
                    }

                    // Detect mentions: @[Name](id) or @ [Name](id)
                    const mentionRegex = /@\s?\[([^\]]+)\]\(([^)]+)\)/g
                    const mentionedUserIds = new Set<string>()
                    let match
                    while ((match = mentionRegex.exec(content || "")) !== null) {
                        const idOrEmail = match[2];
                        mentionedUserIds.add(idOrEmail)

                        // If it looks like an email and isn't in our list yet, add it
                        if (idOrEmail.includes('@') && idOrEmail.includes('.')) {
                            const email = idOrEmail.toLowerCase();
                            if (!uniqueParticipants.has(email) && email !== commenterEmail.toLowerCase()) {
                                uniqueParticipants.set(email, "Friend"); // Default name for external emails
                            }
                        }
                    }

                    console.log(`[Notification] Processing comment alerts for ${uniqueParticipants.size} people`)

                    for (const [email, name] of uniqueParticipants.entries()) {
                        const firstName = name.split(' ')[0] || 'Friend'
                        const lastName = name.split(' ').slice(1).join(' ') || ''
                        const magicToken = generateMagicToken({ email, firstName, lastName })
                        const hasImages = !!(newComment.images && newComment.images.length > 0)

                        // If user is mentioned, send tag notification
                        if (mentionedUserIds.has(email)) {
                            console.log(`[Notification] Sending tag alert (comment) to: ${email}`)
                            await sendTagNotification({
                                email,
                                firstName,
                                lastName,
                                authorName: commenterName, // Using commenter as the one who tagged
                                eventName: event.name,
                                eventSlug: event.slug,
                                magicToken,
                                postId: post._id.toString(),
                                hasImages
                            })
                        } else {
                            // Otherwise send standard curiosity-driven comment notification
                            await sendCommentNotification({
                                email,
                                firstName,
                                lastName,
                                commenterName,
                                eventName: event.name,
                                eventSlug: event.slug,
                                magicToken,
                                postId: post._id.toString(),
                                hasImages
                            })
                        }
                    }
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
