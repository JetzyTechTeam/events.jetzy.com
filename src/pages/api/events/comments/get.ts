import { Comments } from "@/models/events/comments";
import mongoose from "mongoose";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { eventId } = req.query;
    
    const comments = await Comments.find({
      eventId: new mongoose.Types.ObjectId(eventId as string),
    })
      .populate({ path: "userId", select: "email phoneNumber" })
      .sort({ createdAt: -1 });

    return res.status(200).json(comments);
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
