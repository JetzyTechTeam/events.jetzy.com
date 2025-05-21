import { EventInvitation } from "@/models/events/event-invitations";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { eventId, email } = req.query;

  if (!eventId || !email) {
    return res.status(400).json({ message: "Missing eventId or email" });
  }

  try {
    const guest = await EventInvitation.findOne({
      eventId, 
      email,
      status: "pending"
    })

    if (!guest) {
      return res.status(404).json({ message: "Guest not found" });
    }

    guest.status = "declined";
    guest.declinedAt = new Date();
    await guest.save();

    return res.status(200).json({ message: "Guest declined successfully" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
}