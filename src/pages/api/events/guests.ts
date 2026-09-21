import { sendResponse } from "@/lib/helpers";
import { ResCode } from "@/lib/responseCodes";
import { EventInvitation } from "@/models/events/event-invitations";
import { NextApiRequest, NextApiResponse } from "next";
import { ensureDbConnected } from "@/configs/database";
import { Events } from "@/models/events";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import { Types } from "mongoose";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await ensureDbConnected()
  try {
    const { eventId } = req.query;
    if (!eventId) {
      return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST);
    }
    if (typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
      return sendResponse(res, null, "Invalid event ID", false, ResCode.BAD_REQUEST);
    }

    // Guest list is PII — admin OR owner of the event only.
    const session = await getServerSession(req, res, authOptions);
    const userRole = (session?.user as any)?.role;
    const userId = (session?.user as any)?._id?.toString();
    if (!userId) return sendResponse(res, null, "Not authenticated", false, ResCode.UNAUTHORIZED);
    const isAdmin = userRole === "admin" || userRole === "super admin";
    const event = await Events.findById(eventId).select("ownerId").lean();
    if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND);
    if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
      return sendResponse(res, null, "Not authorized", false, ResCode.FORBIDDEN);
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