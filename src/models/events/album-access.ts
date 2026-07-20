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
