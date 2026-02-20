import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { Roles } from "@/types"

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

        // @ts-ignore
        if (session.user.role !== Roles.ADMIN && session.user.role !== Roles.SUPER_ADMIN) {
            // Also allow the event host to update their own event's feedback link
            const eventId = req.body.eventId
            const event = await Events.findById(eventId)
            // @ts-ignore
            if (!event || event.ownerId?.toString() !== session.user._id?.toString()) {
                return sendResponse(res, null, "Unauthorized.", false, ResCode.FORBIDDEN)
            }
        }

        const { eventId, feedbackFormUrl } = req.body
        if (!eventId) {
            return sendResponse(res, null, "Event ID is required.", false, ResCode.BAD_REQUEST)
        }

        const updatedEvent = await Events.findByIdAndUpdate(
            eventId,
            { $set: { feedbackFormUrl } },
            { new: true }
        )

        if (!updatedEvent) {
            return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)
        }

        return sendResponse(res, updatedEvent, "Feedback link updated successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error updating feedback link:", error)
        return sendResponse(res, null, error.message || "Internal server error.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
