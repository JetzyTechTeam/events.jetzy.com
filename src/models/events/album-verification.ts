import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

/**
 * A pending email-verification code for the album access dialog.
 *
 * The album gate used to take a name + email on trust: it issued a 90-day cookie and
 * silently created a Jetzy account for whatever address was typed, so the captured
 * interests were only as good as the visitor's honesty. A code proves the address before
 * anything is written.
 *
 * Deliberately its own collection rather than reusing EventUsers.manualVerificationCode —
 * that field belongs to the compliance-unblock flow (api/auth/verify/confirm-code.ts), and
 * an album code that also unblocks an account would be a privilege leak.
 *
 * Rows are short-lived and upserted per (event, email); a verified code is deleted on use.
 */
export interface IAlbumVerification {
	_id?: string
	eventId: Schema.Types.ObjectId
	email: string
	/** 6-digit code. Plain, matching the existing manualVerificationCode precedent. */
	code: string
	expiresAt: Date
	/** Wrong guesses so far. Capped so a code can't be brute-forced within its TTL. */
	attempts: number
	/** Drives the resend cooldown. */
	lastSentAt: Date
	createdAt?: Date
	updatedAt?: Date
}

const albumVerificationSchema = new Schema<IAlbumVerification>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Events",
			index: true,
		},
		email: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		code: {
			type: String,
			required: true,
		},
		expiresAt: {
			type: Date,
			required: true,
		},
		attempts: {
			type: Number,
			default: 0,
		},
		lastSentAt: {
			type: Date,
			required: true,
		},
	},
	{
		timestamps: true,
	},
)

// One pending code per person per event. The connection sets autoIndex: false, so this is
// built by scripts/create-album-verification-index.ts — every query here reads the newest
// row (sort by createdAt desc) rather than assuming the index exists.
albumVerificationSchema.index({ eventId: 1, email: 1 })

export const AlbumVerification: Model<IAlbumVerification> =
	dbconn.models["AlbumVerification"] || dbconn.model("AlbumVerification", albumVerificationSchema, "event-album-verifications")
