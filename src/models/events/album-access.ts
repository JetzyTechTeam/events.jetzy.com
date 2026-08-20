import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

export type AlbumAccessAction = "login" | "signup"

export interface IAlbumAccess {
	_id?: string
	eventId: Schema.Types.ObjectId
	albumId: Schema.Types.ObjectId
	/** Optional: a NextAuth session _id can come from EventUsers while the guest gate maps to `users`. */
	userId?: Schema.Types.ObjectId
	/** Stable identity across both paths — this is the dedupe key. */
	viewerEmail: string
	viewerName?: string
	action: AlbumAccessAction
	/**
	 * Viewer proved their email (a code, or a real NextAuth session). ABSENT on rows written
	 * before the gate existed — report those as "unverified", not as a failure.
	 */
	verified?: boolean
	/**
	 * When they signed in / signed up / passed the code — which is NOT `createdAt`.
	 * `createdAt` is when they opened this album; a viewer can identify once and come back to
	 * a second album days later.
	 */
	identifiedAt?: Date
	createdAt?: Date
	updatedAt?: Date
}

const albumAccessSchema = new Schema<IAlbumAccess>(
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
		userId: {
			type: Schema.Types.ObjectId,
			required: false,
			ref: "Users",
		},
		viewerEmail: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		viewerName: {
			type: String,
			required: false,
		},
		action: {
			type: String,
			enum: ["login", "signup"],
			required: true,
		},
		// No default: absent means the row predates the verification gate.
		verified: {
			type: Boolean,
			required: false,
		},
		identifiedAt: {
			type: Date,
			required: false,
		},
	},
	{
		timestamps: true,
	},
)

// One row per (album, viewer email): guarantees once-per-person-per-album.
// The unique index is both the email-dedupe guard and the analytics source.
// NOTE: the previous { albumId, userId } unique index must be dropped — userId is now
// optional and multiple nulls would collide. See scripts/migrate-album-access-index.js
albumAccessSchema.index({ albumId: 1, viewerEmail: 1 }, { unique: true })

export const AlbumAccess: Model<IAlbumAccess> =
	dbconn.models["AlbumAccess"] || dbconn.model("AlbumAccess", albumAccessSchema, "event-album-access")
