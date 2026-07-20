import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

/**
 * Interests a viewer picks in the album access dialog. Captured for event planning —
 * the CEO uses this to see what album audiences want next. One row per (event, email),
 * upserted, so re-entry updates rather than duplicating.
 */
export interface IAlbumInterest {
	_id?: string
	eventId: Schema.Types.ObjectId
	email: string
	name?: string
	/** May be absent if account creation failed — email is the stable key. */
	userId?: Schema.Types.ObjectId
	/** Curated labels picked from the chip grid. */
	interests: string[]
	/** Free-text "tell us your interest", counts as one of the three. */
	customInterest?: string
	createdAt?: Date
	updatedAt?: Date
}

const albumInterestSchema = new Schema<IAlbumInterest>(
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
		name: {
			type: String,
			required: false,
		},
		userId: {
			type: Schema.Types.ObjectId,
			required: false,
			ref: "Users",
		},
		interests: {
			type: [String],
			default: [],
		},
		customInterest: {
			type: String,
			required: false,
		},
	},
	{
		timestamps: true,
	},
)

// One row per person per event — upsert on re-entry.
albumInterestSchema.index({ eventId: 1, email: 1 }, { unique: true })

export const AlbumInterest: Model<IAlbumInterest> =
	dbconn.models["AlbumInterest"] || dbconn.model("AlbumInterest", albumInterestSchema, "event-album-interests")
