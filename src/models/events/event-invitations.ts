import { dbconn } from "@/configs/database";
import { Model, Schema } from "mongoose";

interface IEventInvitations {
  eventId: Schema.Types.ObjectId;
  email: string;
  status: "pending" | "accepted" | "declined";
  invitedAt: Date;
  acceptedAt?: Date;
  declinedAt?: Date;
  name?: string;
}

const eventInvitationSchema = new Schema({
  eventId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: "Event",
  },
  name: {
    type: String,
    default: "",
  },
  email: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "declined"],
    default: "pending",
  },
  invitedAt: {
    type: Date,
    default: Date.now,
  },
  acceptedAt: {
    type: Date,
  },
  declinedAt: {
    type: Date,
  },
});

export const EventInvitation: Model<IEventInvitations> =
  dbconn.models["EventInvitation"] ||
  dbconn.model("EventInvitation", eventInvitationSchema, "eventinvitations");
