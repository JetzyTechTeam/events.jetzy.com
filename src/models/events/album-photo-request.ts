import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

/**
 * A viewer asking the host for the unwatermarked original of one album photo.
 *
 * The album page shows every photo under a `JetzyLifeMark` overlay. This is the record of
 * somebody asking for the clean file — one row per photo per person, so the host can see
 * exactly which image was wanted rather than "someone wants some photos".
 *
 * Deliberately a LOG, not a fulfilment workflow: nothing here changes what any endpoint
 * serves. The host reads the request in the manage console and follows up by hand, which is
 * what the confirmation email promises ("we'll get back to you").
 *
 * A viewer can ask for several photos at once. That still writes ONE ROW PER PHOTO, sharing a
 * `batchId` — the host sends files one at a time and marks off what they have sent, so a single
 * row covering five photos could only ever be half true.
 */
export type AlbumPhotoRequestStatus = "pending" | "handled"

export interface IAlbumPhotoRequest {
	_id?: string
	eventId: Schema.Types.ObjectId
	albumId: Schema.Types.ObjectId
	/** The exact media item asked for. Validated against the album's stored media on write. */
	mediaUrl: string
	mediaType?: "image" | "video"
	/**
	 * Groups the rows written by one multi-photo request. Absent on single-photo requests and
	 * on everything written before multi-select existed — so it is a display hint, never a key.
	 */
	batchId?: string
	/** Optional: a NextAuth session _id can come from EventUsers while the guest gate maps to `users`. */
	userId?: Schema.Types.ObjectId
	/** Stable identity across both paths — this is the dedupe key, like AlbumAccess.viewerEmail. */
	requesterEmail: string
	requesterName?: string
	/**
	 * The address was proved — a NextAuth session, or a code passed at request time.
	 * Every row written by this feature is true; the field exists so a future path that
	 * relaxes the gate can't silently look the same as one that didn't.
	 */
	verified?: boolean
	status: AlbumPhotoRequestStatus
	handledAt?: Date
	/** Who marked it handled — an admin or the event owner. */
	handledBy?: Schema.Types.ObjectId
	createdAt?: Date
	updatedAt?: Date
}

const albumPhotoRequestSchema = new Schema<IAlbumPhotoRequest>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Events",
			index: true,
		},
		albumId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "EventAlbums",
			index: true,
		},
		mediaUrl: {
			type: String,
			required: true,
			trim: true,
		},
		mediaType: {
			type: String,
			required: false,
		},
		batchId: {
			type: String,
			required: false,
		},
		userId: {
			type: Schema.Types.ObjectId,
			required: false,
			ref: "Users",
		},
		requesterEmail: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		requesterName: {
			type: String,
			required: false,
		},
		verified: {
			type: Boolean,
			required: false,
		},
		status: {
			type: String,
			required: true,
			default: "pending",
		},
		handledAt: {
			type: Date,
			required: false,
		},
		handledBy: {
			type: Schema.Types.ObjectId,
			required: false,
		},
	},
	{
		timestamps: true,
	},
)

// The host's table reads an event's requests newest-first. The connection sets
// autoIndex: false, so this is built by scripts/create-album-photo-request-index.ts.
//
// Deliberately NOT unique on (albumId, requesterEmail, mediaUrl): asking again after being
// ignored is legitimate, and a unique index that failed to build would throw 11000 at the
// visitor. The duplicate guard is a pending-row lookup in the API, which is advisory.
albumPhotoRequestSchema.index({ eventId: 1, createdAt: -1 })

export const AlbumPhotoRequest: Model<IAlbumPhotoRequest> =
	dbconn.models["AlbumPhotoRequest"] || dbconn.model("AlbumPhotoRequest", albumPhotoRequestSchema, "event-album-photo-requests")
