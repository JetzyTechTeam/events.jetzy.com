import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { sendThankYouNotification } from "@/lib/send-grid"
import { generateMagicToken } from "@/lib/magicLink"
import { carryDraftForward } from "@/lib/event-draft"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
    }

    await ensureDbConnected()
    const session = await getServerSession(req, res, authOptions)

    try {
        if (!session || !session.user) {
            return sendResponse(res, null, "You need to be logged in.", false, ResCode.UNAUTHORIZED)
        }

        const userRole = (session.user as any)?.role
        const userId = (session.user as any)?._id?.toString()
        const isAdmin = userRole === "admin" || userRole === "super admin"

        const { eventId } = req.body
        if (!eventId) {
            return sendResponse(res, null, "Event ID is required.", false, ResCode.BAD_REQUEST)
        }

        // `+draftRevision` for the carry-forward below — the field is `select: false`.
        const event = await Events.findById(eventId).select("+draftRevision")
        if (!event) {
            return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)
        }

        if (!isAdmin && event.ownerId?.toString() !== userId) {
            return sendResponse(res, null, "Access denied. You can only send emails for your own events.", false, ResCode.FORBIDDEN)
        }

        if (!event.feedbackFormUrl) {
            return sendResponse(res, null, "Feedback form link is missing. Please add it first.", false, ResCode.BAD_REQUEST)
        }

        // Fetch all confirmed/completed bookings
        const participants = await Bookings.find({
            eventId: event._id,
            isDeleted: false,
            status: { $in: ['confirmed', 'completed'] }
        }).select('customerEmail customerName')

        if (participants.length === 0) {
            return sendResponse(res, null, "No participants found to receive emails.", false, ResCode.BAD_REQUEST)
        }

        // Send emails in background
        (async () => {
            try {
                console.log(`[ThankYouBlast] Sending emails to ${participants.length} participants for event: ${event.name}`)

                for (const p of participants) {
                    if (!p.customerEmail) continue

                    const firstName = p.customerName?.split(' ')[0] || 'Friend'
                    const lastName = p.customerName?.split(' ').slice(1).join(' ') || ''
                    const magicToken = generateMagicToken({ email: p.customerEmail, firstName, lastName })

                    await sendThankYouNotification({
                        email: p.customerEmail,
                        firstName,
                        lastName,
                        eventName: event.name,
                        eventSlug: event.slug,
                        magicToken,
                        formLink: event.feedbackFormUrl as string
                    })
                }

                // Update sent status
                // Sending a blast changes no event content, but it moves `updatedAt`, which is
                // what retires the host's shadow draft. Carry it forward in the same write.
                await Events.findByIdAndUpdate(eventId, {
                    $set: { thankYouEmailSentAt: new Date(), ...carryDraftForward(event as any) }
                })
                console.log(`[ThankYouBlast] Successfully sent all emails for event: ${event.name}`)
            } catch (error) {
                console.error("[ThankYouBlast] Error sending emails:", error)
            }
        })()

        return sendResponse(res, { count: participants.length }, "Thank you emails are being sent.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error triggering thank you emails:", error)
        return sendResponse(res, null, error.message || "Internal server error.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
