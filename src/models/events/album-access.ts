import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

export type AlbumAccessAction = "login" | "signup"

export interface IAlbumAccess {
	_id?: string
	eventId: Schema.Types.ObjectId
	albumId: Schema.Types.ObjectId
	userId: Schema.Types.ObjectId
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
			required: true,
			ref: "Users",
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

// One row per (album, user): guarantees once-per-user-per-album.
// The unique index is both the email-dedupe guard and the analytics source.
albumAccessSchema.index({ albumId: 1, userId: 1 }, { unique: true })

export const AlbumAccess: Model<IAlbumAccess> =
	dbconn.models["AlbumAccess"] || dbconn.model("AlbumAccess", albumAccessSchema, "event-album-access")
