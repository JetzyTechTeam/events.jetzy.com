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
 * Rows are short-lived and upserted per (event, email, purpose); a verified code is deleted on
 * use. `purpose` arrived when the same mechanism started gating a Jetzy Premium purchase from a
 * shared referral link — without it, asking for a premium code would silently overwrite the album
 * code the same person had just requested for the same event.
 */
export interface IAlbumVerification {
	_id?: string
	/**
	 * The event the code belongs to — or NULL when it belongs to no event.
	 *
	 * Null arrived when Premium started being bought from `/premium`, `/subscribe` and the
	 * paywall modal, none of which have an event. It is a real stored value, not a missing
	 * field: `{ eventId: null }` is what the queries match on.
	 */
	eventId: Schema.Types.ObjectId | null
	email: string
	/** What the code is for. Absent on every row written before Premium used this. */
	purpose?: string
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
		// Not required: a Premium login code is bound to an email and a purpose, not an event.
		eventId: {
			type: Schema.Types.ObjectId,
			required: false,
			default: null,
			ref: "Events",
			index: true,
		},
		email: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		// No default, deliberately: existing rows have no `purpose`, and the album queries match
		// them with `$in: ["album", null]` rather than a backfill.
		purpose: {
			type: String,
			required: false,
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
albumVerificationSchema.index({ eventId: 1, email: 1, purpose: 1 })

export const AlbumVerification: Model<IAlbumVerification> =
	dbconn.models["AlbumVerification"] || dbconn.model("AlbumVerification", albumVerificationSchema, "event-album-verifications")
