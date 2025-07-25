import { sendResponse } from "@/lib/helpers";
import { ResCode } from "@/lib/responseCodes";
import { EventInvitation } from "@/models/events/event-invitations";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
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