import { EventInvitation } from "@/models/events/event-invitations";
import mongoose from "mongoose";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { email, eventId } = req.query;

  if (!email || !eventId) {
    return res.status(400).json({ message: "Missing email or eventId" });
  }

  try {
    const guest = await EventInvitation.findOne({
      eventId: new mongoose.Types.ObjectId(eventId as string),
      email,
    })    

    if (!guest) {
      return res.status(404).json({ message: "Guest not found" });
    }
    
    return res.status(200).json(guest);

  } catch (error) {
    console.error("API Error:", error); 
    return res.status(500).json({ message: "Something went wrong" });
  }

}