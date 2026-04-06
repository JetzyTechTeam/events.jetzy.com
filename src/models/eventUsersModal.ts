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
    // Location fields for events proximity matching
    location: {
      type: String,
      required: false,
      trim: true,
    },
    latitude: {
      type: Number,
      required: false,
    },
    longitude: {
      type: Number,
      required: false,
    },
    placeId: {
      type: String,
      required: false,
    },
    // Account safety fields
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedAt: {
      type: Date,
      required: false,
    },
    blockedReason: {
      type: String,
      required: false,
    },
    emailBounced: {
      type: Boolean,
      default: false,
    },
    requiresVerification: {
      type: Boolean,
      default: false,
    },
    // Mandatory verification for blocked users
    manualVerificationCode: {
      type: String,
      required: false,
    },
    manualVerificationCodeExpiresAt: {
      type: Date,
      required: false,
    },
    complianceStatus: {
      type: String,
      enum: ["unverified", "verified_pending_review", "approved", "rejected"],
      default: "unverified",
    },
    adminUnblockToken: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
)

export const EventUsers = dbconn.models.EventUsers || dbconn.model("EventUsers", eventUsersSchema, 'event-users')
