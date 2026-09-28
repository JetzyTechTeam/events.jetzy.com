import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../../auth/[...nextauth]"
import { Roles } from "@/types"
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

        const { eventId, questions } = req.body
        if (!eventId) {
            return sendResponse(res, null, "Event ID is required.", false, ResCode.BAD_REQUEST)
        }
        if (!Array.isArray(questions)) {
            return sendResponse(res, null, "Questions array is required.", false, ResCode.BAD_REQUEST)
        }

        // `+draftRevision` because the field is `select: false` — without it the carry-forward
        // below would never see a draft and would silently do nothing.
        const event = await Events.findById(eventId).select("+draftRevision")

        // @ts-ignore
        if (session.user.role !== Roles.ADMIN && session.user.role !== Roles.SUPER_ADMIN) {
            // Also allow the event host to update their own event's questions
            // @ts-ignore
            if (!event || event.ownerId?.toString() !== session.user._id?.toString()) {
                return sendResponse(res, null, "Unauthorized.", false, ResCode.FORBIDDEN)
            }
        }

        // Same carry-forward as the other non-content writers: custom questions are not part
        // of the draft payload, so moving `updatedAt` must not retire the host's draft.
        const updatedEvent = await Events.findByIdAndUpdate(
            eventId,
            { $set: { questions, ...carryDraftForward(event as any) } },
            { new: true }
        )

        if (!updatedEvent) {
            return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)
        }

        return sendResponse(res, updatedEvent, "Questions updated successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error updating custom questions:", error)
        return sendResponse(res, null, error.message || "Internal server error.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
