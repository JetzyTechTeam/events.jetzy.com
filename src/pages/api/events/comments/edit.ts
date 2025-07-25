import { Comments } from "@/models/events/comments";
import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]";
import mongoose from "mongoose";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
   throw new Error("You must be logged in to create a comment");
  }

  const { eventId, commentId, newComment } = req.body;

  if (!eventId || !commentId || !newComment) {
    return res.status(400).json({ message: "Missing EventId, CommentId or NewComment!" });
  }

  try {
    const filter = {
    eventId: new mongoose.Types.ObjectId(eventId),
    _id: new mongoose.Types.ObjectId(commentId),
    // @ts-ignore
    userId: new mongoose.Types.ObjectId(session.user._id),
  };

  const update = {
    $set: { comment: newComment },
  };

  const result = await Comments.updateOne(filter, update);

    return res.status(200).json({ message: "Comment created successfully" });

  } catch (err) {
    return res.status(500).json({ message: "Something went wrong" });
  }
}
