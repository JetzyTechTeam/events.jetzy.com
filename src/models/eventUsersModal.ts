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
      required: false,
      trim: true,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    image: {
      type: String,
      required: false,
    },
    authProvider: {
      type: String,
      default: "credentials",
    },
    firebaseUid: {
      type: String,
      required: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    acceptedTerms: {
      type: Boolean,
      default: false,
    },
    acceptedTermsAt: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true }
)

export const EventUsers = dbconn.models.EventUsers || dbconn.model("EventUsers", eventUsersSchema, 'event-users')
