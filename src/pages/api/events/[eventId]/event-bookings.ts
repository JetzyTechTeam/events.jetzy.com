import { Bookings } from "@/models/events/bookings";
import { Events } from "@/models/events";
import { NextApiRequest, NextApiResponse } from "next";
import { ensureDbConnected } from "@/configs/database";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

/**
 * Bookings for an event, used by the admin panel on the public event page.
 *
 * Was unauthenticated. Booking documents now carry Stripe identifiers on `payment`,
 * so this is restricted to the event owner (or an admin) and the Stripe ids are
 * projected out — no client surface needs them.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await ensureDbConnected()
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  const session = await getServerSession(req, res, authOptions)
  const userId = (session?.user as any)?._id?.toString()
  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const role = (session?.user as any)?.role
    const isAdmin = role === "admin" || role === "super admin"

    const event = await Events.findById(eventId).select("_id ownerId")
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized to view bookings for this event" });
    }

    const bookings = await Bookings.find({ eventId: eventId })
      .select("-payment.paymentIntentId -payment.checkoutSessionId");

    return res.status(200).json(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({ message: "Error fetching bookings" });
  }
}
