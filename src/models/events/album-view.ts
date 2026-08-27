import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

/**
 * A visit to an album page, recorded BEFORE anyone is identified.
 *
 * `AlbumAccess` is only written once someone is through the gate, so every person who landed
 * on an album, saw the name+email dialog and walked away was invisible — which is exactly the
 * population a host needs to see. This records the landing and then each step of the gate, so
 * the Albums tab can show where people drop out instead of only who made it.
 *
 * Keyed on the analytics `anonId` (localStorage), the same id the rest of the journey tracking
 * uses. No email is required to write a row; `viewerEmail` is filled in only once they identify.
 *
 * ONE ROW PER PERSON PER ALBUM, with `views` counting return visits. The stage timestamps use
 * `$min` so the EARLIEST moment wins — a second visit must not overwrite when they first got
 * through the gate.
 */
export interface IAlbumView {
	_id?: string
	eventId: Schema.Types.ObjectId
	albumId: Schema.Types.ObjectId
	/** localStorage `analytics_anon_id`. Present for signed-in visitors too. */
	anonId: string
	sessionId?: string
	/** How many times this person opened this album. */
	views: number
	landedAt?: Date
	/** They were shown the name + email dialog. Absent means they were already identified. */
	gateShownAt?: Date
	/** They submitted the form and a code went out. */
	codeSentAt?: Date
	/** They got through — code accepted, or they arrived already signed in. */
	identifiedAt?: Date
	/** Only known from `identifiedAt` onwards. */
	viewerEmail?: string
	createdAt?: Date
	updatedAt?: Date
}

const albumViewSchema = new Schema<IAlbumView>(
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
		anonId: {
			type: String,
			required: true,
			trim: true,
		},
		sessionId: {
			type: String,
			required: false,
		},
		views: {
			type: Number,
			default: 0,
		},
		landedAt: { type: Date, required: false },
		gateShownAt: { type: Date, required: false },
		codeSentAt: { type: Date, required: false },
		identifiedAt: { type: Date, required: false },
		viewerEmail: {
			type: String,
			required: false,
			lowercase: true,
			trim: true,
		},
	},
	{
		timestamps: true,
	},
)

// Lookup for the upsert and for the funnel aggregation. Built by
// scripts/create-album-view-index.ts (`autoIndex: false`).
//
// Deliberately NOT unique. An upsert can duplicate under a race without one, but every count
// that has to be exact groups by `anonId` anyway, so a duplicate row costs a slightly inflated
// `views` sum and nothing else — whereas a unique index that failed to build would throw 11000
// on a page visit, which is the one place an analytics write must never be visible.
albumViewSchema.index({ albumId: 1, anonId: 1 })
albumViewSchema.index({ eventId: 1, createdAt: -1 })

export const AlbumView: Model<IAlbumView> =
	dbconn.models["AlbumView"] || dbconn.model("AlbumView", albumViewSchema, "event-album-views")
