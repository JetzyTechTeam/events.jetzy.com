import { Comments } from "@/models/events/comments";
import { Events } from "@/models/events";
import mongoose from "mongoose";
import { NextApiRequest, NextApiResponse } from "next";
import { ensureDbConnected } from "@/configs/database";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]";

/**
 * Deletes a comment and its replies.
 *
 * The filter used to be `{ eventId, _id }` with no `userId` and no role check, so any logged-in
 * user could delete anyone's comment on any event — and the follow-up `deleteMany` took the
 * whole reply thread with it.
 *
 * Allowed: the comment's author, an admin, or the event's owner. The last two are moderation,
 * which is a real need — a host has to be able to remove something abusive from their own event.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await ensureDbConnected()
  if (req.method !== "DELETE") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const session = await getServerSession(req, res, authOptions);

  // A 401, not a thrown Error — the throw surfaced as an unhandled 500, which reads as a broken
  // server rather than "sign in".
  if (!session) {
    return res.status(401).json({ message: "You must be logged in to delete a comment" });
  }

  const { eventId, commentId } = req.query;

  if (!eventId || typeof eventId !== "string" || !mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({ message: "Valid eventId is required" });
  }
  if (!commentId || typeof commentId !== "string" || !mongoose.Types.ObjectId.isValid(commentId)) {
    return res.status(400).json({ message: "Valid commentId is required" });
  }

  try {
    const comment = await Comments.findOne({
      eventId: new mongoose.Types.ObjectId(eventId),
      _id: new mongoose.Types.ObjectId(commentId),
    }).lean();

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const userRole = (session.user as any)?.role;
    const userId = (session.user as any)?._id?.toString();
    const isAdmin = userRole === "admin" || userRole === "super admin";
    const isAuthor = (comment as any).userId?.toString() === userId;

    let isEventOwner = false;
    if (!isAdmin && !isAuthor) {
      const event = await Events.findOne({ _id: new mongoose.Types.ObjectId(eventId), isDeleted: false })
        .select("_id ownerId")
        .lean();
      isEventOwner = !!event && (event as any).ownerId?.toString() === userId;
    }

    if (!isAdmin && !isAuthor && !isEventOwner) {
      return res.status(403).json({ message: "You can only delete your own comments" });
    }

    await Comments.deleteOne({
      eventId: new mongoose.Types.ObjectId(eventId),
      _id: new mongoose.Types.ObjectId(commentId),
    });

    // Replies belong to the comment, so they go with it — but only once the delete above is
    // authorized, which is what was missing.
    await Comments.deleteMany({
      parentCommentId: new mongoose.Types.ObjectId(commentId),
    })

    return res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
}
