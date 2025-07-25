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

    const comments = await Comments.find({
      eventId: new mongoose.Types.ObjectId(eventId as string),
    })
      .populate({ path: "userId", select: "email phoneNumber" })
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json(comments);
  } catch (error: unknown) {
    console.log({error})
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ message: errorMessage || "Something went wrong" });
  }
}
