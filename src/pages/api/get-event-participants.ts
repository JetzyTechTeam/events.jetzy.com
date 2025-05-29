import { Bookings } from "@/models/events/bookings";
import mongoose from "mongoose";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }
  const {eventId} = req.query;

  const participants = await Bookings.find({eventId: new mongoose.Types.ObjectId(eventId as string)});

  if (!participants) {
    return res.status(404).json({ message: 'No participants found' })
  }

  return res.status(200).json({participants});

}