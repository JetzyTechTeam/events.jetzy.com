import { Comments } from "@/models/events/comments";
import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    throw new Error("You must be logged in to create a comment");
  }

  const { eventId, commentId, reply } = req.body;

  if (!eventId || !commentId || !reply) {
    return res
      .status(400)
      .json({ message: "Missing EventId, CommentId or Reply!" });
  }

  try {
    await Comments.insertOne({
      eventId,
      parentCommentId: commentId,
      comment: reply,
      // @ts-ignore
      userId: session?.user?._id,
    });

    return res.status(200).json({ message: "Reply added successfully" });
  } catch (err) {
    console.error("Error adding reply:", err);
    return res.status(500).json({ message: "Something went wrong" });
  }
}
