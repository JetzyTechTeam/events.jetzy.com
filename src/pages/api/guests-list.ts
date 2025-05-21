import { EventInvitation } from "@/models/events/event-invitations";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  try {
    const { eventId } = req.query;
    const eventInvitations = await EventInvitation.find({
      eventId
    });

    if (!eventInvitations) {
      return res.status(404).json({ message: "No Event Guests found" });
    }
    return res.status(200).json(eventInvitations);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Something went wrong" });
  }
}