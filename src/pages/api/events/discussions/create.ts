import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import zod from "zod"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { generateMagicToken } from "@/lib/magicLink"
import { sendDiscussionNotification, sendTagNotification } from "@/lib/send-grid"

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

            // Trigger notifications in the background (don't await to keep response fast)
            // We'll use a self-executing async function for this
            ; (async () => {
                try {
                    const event = await Events.findById(eventId)
                    if (!event) return

                    const authorName = `${(newPost.userId as any).firstName} ${(newPost.userId as any).lastName}`
                    const authorEmail = (newPost.userId as any).email

                    // Detect mentions: @[Name](id) or @ [Name](id)
                    const mentionRegex = /@\s?\[([^\]]+)\]\(([^)]+)\)/g
                    const mentionedUserIds = new Set<string>()
                    let match
                    while ((match = mentionRegex.exec(content || "")) !== null) {
                        mentionedUserIds.add(match[2])
                    }

                    // Fetch all unique participants for this event
                    const participants = await Bookings.find({
                        eventId,
                        isDeleted: false,
                        status: { $in: ['confirmed', 'completed'] }
                    }).select('customerEmail customerName')

                    const uniqueParticipants = new Map<string, string>()
                    participants.forEach(p => {
                        const email = p.customerEmail?.toLowerCase()
                        if (email && email !== authorEmail.toLowerCase()) {
                            uniqueParticipants.set(email, p.customerName)
                        }
                    })

                    console.log(`[Notification] Processing alerts for ${uniqueParticipants.size} participants`)

                    for (const [email, name] of uniqueParticipants.entries()) {
                        const firstName = name.split(' ')[0] || 'Friend'
                        const lastName = name.split(' ').slice(1).join(' ') || ''
                        const magicToken = generateMagicToken({ email, firstName, lastName })
                        const hasImages = !!(newPost.images && newPost.images.length > 0)

                        // If user is mentioned, send tag notification
                        if (mentionedUserIds.has(email)) {
                            console.log(`[Notification] Sending tag alert to: ${email}`)
                            await sendTagNotification({
                                email,
                                firstName,
                                lastName,
                                authorName,
                                eventName: event.name,
                                eventSlug: event.slug,
                                magicToken,
                                postId: newPost._id.toString(),
                                hasImages
                            })
                        } else {
                            // Otherwise send standard curiosity-driven notification
                            await sendDiscussionNotification({
                                email,
                                firstName,
                                lastName,
                                authorName,
                                eventName: event.name,
                                eventSlug: event.slug,
                                magicToken,
                                postId: newPost._id.toString(),
                                hasImages
                            })
                        }
                    }
                } catch (notifyError) {
                    console.error("[Notification] Failed to send discussion alerts:", notifyError)
                }
            })()

        return sendResponse(res, newPost, "Post created successfully.", true, ResCode.CREATED)
    } catch (error: any) {
        console.error("Error creating discussion post:", error)
        return sendResponse(res, null, error.message || "Failed to create post.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
