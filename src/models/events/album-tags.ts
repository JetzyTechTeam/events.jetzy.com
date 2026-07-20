import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

export interface IAlbumTag {
	_id?: string
	eventId: Schema.Types.ObjectId
	albumId: Schema.Types.ObjectId
	/** Which photo/video in the album — media items are identified by their URL. */
	mediaUrl: string
	personEmail: string
	personName?: string
	taggedByEmail?: string
	taggedByName?: string
	notifiedAt?: Date
	createdAt?: Date
	updatedAt?: Date
}

const albumTagSchema = new Schema<IAlbumTag>(
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
		},
		personEmail: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		personName: {
			type: String,
			required: false,
		},
		taggedByEmail: {
			type: String,
			required: false,
			lowercase: true,
			trim: true,
		},
		taggedByName: {
			type: String,
			required: false,
		},
		notifiedAt: {
			type: Date,
			required: false,
		},
	},
	{
		timestamps: true,
	},
)

// Lookup index for "tags on this photo". Intentionally NOT unique: the same person can
// be tagged more than once on the same photo, and each tag emails them again.
// (An older build had this as unique — see scripts/migrate-album-tags-index.ts.)
albumTagSchema.index({ albumId: 1, mediaUrl: 1, personEmail: 1 })

export const AlbumTags: Model<IAlbumTag> =
	dbconn.models["AlbumTags"] || dbconn.model("AlbumTags", albumTagSchema, "event-album-tags")
