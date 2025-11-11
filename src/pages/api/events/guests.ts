import { sendResponse } from "@/lib/helpers";
import { ResCode } from "@/lib/responseCodes";
import { EventInvitation } from "@/models/events/event-invitations";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure database connection is ready
    const { dbconn } = await import("@/configs/database")
    if (dbconn.readyState !== 1) {
      console.log("[guests] Database not connected, attempting to connect...")
      try {
        await Promise.race([
          dbconn.asPromise(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Connection timeout")), 30000)
          )
        ])
      } catch (connError: any) {
        console.error("[guests] Database connection failed:", connError.message)
        return sendResponse(res, null, "Database connection failed", false, ResCode.INTERNAL_SERVER_ERROR)
      }
    }

    const { eventId } = req.query;
    if (!eventId) {
      return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST);
    }
    const guests = await EventInvitation.find({
      eventId,
      status: 'accepted'
    })

    if (guests.length === 0) {
      return sendResponse(res, [], "No guests found for this event", true, ResCode.OK);
    }

    return sendResponse(res, guests, "Guests found for this event", true, ResCode.OK);

  } catch (error: any) {
    return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
  }
}