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
      required: false,
      trim: true,
      default: "",
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
    // Invite/referral code captured at signup (optional)
    refCode: {
      type: String,
      required: false,
      trim: true,
    },
    // Which page the signup came from, e.g. "jetzyqrsignup" | "signup"
    signupSource: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    // Analytics sessionId at the moment of signup — lets us join back to
    // pageviews / usersessions / analytics_web_forms for funnel attribution
    signupSessionId: {
      type: String,
      required: false,
      index: true,
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
    // Password reset fields
    passwordResetToken: {
      type: String,
      required: false,
    },
    passwordResetTokenExpiresAt: {
      type: Date,
      required: false,
    },
    // Email verification (signup verify-link flow)
    emailVerified: {
      type: Boolean,
      default: true,
    },
    verifyToken: {
      type: String,
      required: false,
      index: true,
    },
    verifyTokenExpiresAt: {
      type: Date,
      required: false,
    },
    // The user's Stripe Customer — a BILLING IDENTITY, not a membership. One customer holds
    // every subscription this person has. It used to live inside `premiumSubscription`; that
    // copy is still read as a fallback (`getUserStripeCustomerId`) so no backfill is needed.
    stripeCustomerId: { type: String, required: false, index: true },
    // Jetzy Premium Events subscription (Stripe recurring payment)
    premiumSubscription: {
      active: { type: Boolean, default: false },
      stripeCustomerId: { type: String, required: false },
      stripeSubscriptionId: { type: String, required: false },
      status: { type: String, required: false },
      currentPeriodEnd: { type: Date, required: false },
      cancelAtPeriodEnd: { type: Boolean, default: false },
    },
    // Full Concierge Membership — sold on selectmember.jetzy.com, billed through OUR Stripe
    // when it rides along with a ticket, and mirrored back to their site by
    // `src/lib/select-member.ts`. Independent of `premiumSubscription`: one ending must never
    // end the other.
    conciergeSubscription: {
      active: { type: Boolean, default: false },
      stripeCustomerId: { type: String, required: false },
      stripeSubscriptionId: { type: String, required: false },
      status: { type: String, required: false },
      currentPeriodEnd: { type: Date, required: false },
      cancelAtPeriodEnd: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
)

export const EventUsers = dbconn.models.EventUsers || dbconn.model("EventUsers", eventUsersSchema, 'event-users')
