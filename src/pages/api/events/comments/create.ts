import { Comments } from "@/models/events/comments";
import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
   throw new Error("You must be logged in to create a comment");
  }

  const { eventId, comment } = req.body;

  if (!eventId || !comment) {
    return res.status(400).json({ message: "Missing EventId or Comment!" });
  }

  try {
    await Comments.create({
      eventId,
      comment,
      // @ts-ignore
      userId: session?.user?._id,
    })

    return res.status(200).json({ message: "Comment created successfully" });

  } catch (err) {
    return res.status(500).json({ message: "Something went wrong" });
  }
}
