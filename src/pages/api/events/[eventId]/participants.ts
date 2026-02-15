import { Bookings } from "@/models/events/bookings"
import { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { sendResponse } from "@Jetzy/lib/helpers"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()

    if (req.method !== "GET") {
        return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
    }

    const { eventId } = req.query

    if (!eventId) {
        return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
    }

    try {
        const bookings = await Bookings.find({
            eventId: eventId,
            isDeleted: false,
            status: { $in: ['confirmed', 'completed'] }
        }).select('customerEmail customerName')

        const uniqueParticipants = new Map<string, { id: string; name: string; email: string }>()

        bookings.forEach(booking => {
            const email = booking.customerEmail?.toLowerCase()
            if (email && !uniqueParticipants.has(email)) {
                uniqueParticipants.set(email, {
                    id: email, // Use email as unique identifier for tagging
                    name: booking.customerName || email,
                    email: email
                })
            }
        })

        const participantsList = Array.from(uniqueParticipants.values())

        return sendResponse(res, participantsList, "Participants fetched successfully", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error fetching event participants:", error)
        return sendResponse(res, null, error.message || "Failed to fetch participants", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
