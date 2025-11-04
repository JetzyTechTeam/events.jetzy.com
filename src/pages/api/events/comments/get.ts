import { Comments } from "@/models/events/comments";
import { Users } from "@/models/userModal";
import mongoose from "mongoose";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(400).json({ message: "Event ID is required" });
    }

    const comments = await Comments.find({
      eventId: new mongoose.Types.ObjectId(eventId as string),
    })
      .populate({ 
        path: "userId", 
        select: "email firstName lastName",
        model: Users 
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return res.status(200).json(comments);
  } catch (error: unknown) {
    console.error("Error fetching comments:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ message: errorMessage || "Something went wrong" });
  }
}
