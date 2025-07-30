import { dbconn } from "@/configs/database";
import { Schema } from "mongoose";

export const eventUsersSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    }
  },
  { timestamps: true }
)

export const EventUsers = dbconn.models.eventUsersSchema || dbconn.model("EventUsers", eventUsersSchema, 'event-users')
