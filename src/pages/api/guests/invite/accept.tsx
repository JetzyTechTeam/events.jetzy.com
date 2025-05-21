import { EventInvitation } from "@/models/events/event-invitations";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { eventId, email } = req.query;
  const { name } = req.body;

  if (!eventId || !email) {
    return res.status(400).json({ message: "Missing eventId or email" });
  }

  if (!name) {
    return res.status(400).json({ message: "Please Enter your Name." });
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

    guest.status = "accepted";
    guest.name = name;
    guest.acceptedAt = new Date();

    await guest.save();

    return res.status(200).json({ message: "Guest accepted successfully" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
}