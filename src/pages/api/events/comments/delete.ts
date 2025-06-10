import { Comments } from "@/models/events/comments";
import mongoose from "mongoose";
import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
   throw new Error("You must be logged in to create a comment");
  }

  const { eventId, commentId } = req.query;

  if (!eventId || !commentId) {
    return res.status(400).json({ message: "Missing EventId or CommentId!" });
  }

  try {
    // Assuming Comments is a Mongoose model
    const result = await Comments.deleteOne({
      eventId: new mongoose.Types.ObjectId(eventId as string),
      _id: new mongoose.Types.ObjectId(commentId as string),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    await Comments.deleteMany({
      parentCommentId: new mongoose.Types.ObjectId(commentId as string),
    })

    return res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
}