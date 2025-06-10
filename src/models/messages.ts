import { dbconn } from "@/configs/database";
import { Model, Schema, Types } from "mongoose";

interface IEventMessage extends Document {
  sender: Types.ObjectId;
  recipient: Types.ObjectId;
  content: string;
  timestamp: Date;
}

const eventMessageSchema = new Schema<IEventMessage>(
  {
    sender: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    recipient: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  },
  {
    timestamps: true, 
  }
);

export const EventMessages: Model<IEventMessage> = dbconn.models["EventMessages"] || dbconn.model<IEventMessage>("EventMessages", eventMessageSchema, 'event-messages');
