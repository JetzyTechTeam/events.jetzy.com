import { sendResponse } from "@/lib/helpers";
import { ResCode } from "@/lib/responseCodes";
import { NextApiRequest, NextApiResponse } from "next";
import { ensureDbConnected } from "@/configs/database";
import { Events } from "@/models/events";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import { Types } from "mongoose";
import { fetchEventInvitations } from "@/lib/event-invitations";

/**
 * Invitations for an event, for the Guests panel on the public event page (host/admin only).
 *
 * Two things were wrong here and both made the panel look empty:
 *
 *  1. It queried `{ eventId }` only, so it never saw the Jetzy backend's own invitation shape —
 *     which is how every "Invite Jetzy users" invite is stored. `fetchEventInvitations` reads
 *     both; see that file.
 *  2. It filtered to `status: 'accepted'`. An app invite sits at `pending` until the guest acts,
 *     and an invite emailed from the event page links straight to the event rather than to the
 *     accept page, so it can never reach `accepted` at all. Between them, the panel showed
 *     nothing on most events while the host could see they had invited people.
 *
 * It now returns every invitation with its status, and the panel says what each one is. A host
 * asking "who have I invited" is owed the pending ones most of all — they are the ones still
 * waiting on somebody.
 *
 * Response shape is unchanged: `sendResponse` wraps in `{ data, message, status }`.
 */
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

    const guests = await fetchEventInvitations(eventId);

    if (guests.length === 0) {
      return sendResponse(res, [], "No guests found for this event", true, ResCode.OK);
    }

    return sendResponse(res, guests, "Guests found for this event", true, ResCode.OK);

  } catch (error: any) {
    return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
  }
}
