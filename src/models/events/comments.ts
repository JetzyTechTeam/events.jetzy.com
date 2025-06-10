import { dbconn } from "@/configs/database";
import { Schema } from "mongoose";

const commentSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Users',
      index: true,
    },
    comment: {
      type: String,
      required: true,
    },
    parentCommentId: {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
      default: 'root', 
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Comments = dbconn.models["Comments"] || dbconn.model("Comments", commentSchema, 'event-comments')
