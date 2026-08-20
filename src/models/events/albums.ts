import { dbconn } from "@/configs/database"
import { Model, Schema } from "mongoose"

export interface IAlbumMedia {
	url: string
	type: "image" | "video"
}

export interface IEventAlbum {
	_id?: string
	eventId: Schema.Types.ObjectId
	title: string
	description?: string
	media: IAlbumMedia[]
	createdBy?: Schema.Types.ObjectId
	isDeleted: boolean
	/**
	 * Show the promoted-events rail on this album's page. NO DEFAULT: `undefined` means show,
	 * which is what every album written before the toggle existed needs — adding
	 * `default: false` would silently hide the rail on all of them at the next save.
	 */
	showEvents?: boolean
	/** Albums are visible immediately; publishing is what notifies attendees by email. */
	publishedAt?: Date
	publishNotifiedAt?: Date
	notifiedCount?: number
	createdAt?: Date
	updatedAt?: Date
}

const albumMediaSchema = new Schema<IAlbumMedia>(
	{
		url: {
			type: String,
			required: true,
		},
		type: {
			type: String,
			enum: ["image", "video"],
			required: true,
		},
	},
	{ _id: false },
)

const eventAlbumSchema = new Schema<IEventAlbum>(
	{
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: "Events",
			index: true,
		},
		title: {
			type: String,
			required: true,
			trim: true,
		},
		description: {
			type: String,
			required: false,
			default: "",
		},
		media: {
			type: [albumMediaSchema],
			default: [],
		},
		createdBy: {
			type: Schema.Types.ObjectId,
			ref: "Users",
			required: false,
		},
		isDeleted: {
			type: Boolean,
			default: false,
			index: true,
		},
		// See IEventAlbum.showEvents — deliberately no default.
		showEvents: {
			type: Boolean,
			required: false,
		},
		publishedAt: {
			type: Date,
			required: false,
		},
		publishNotifiedAt: {
			type: Date,
			required: false,
		},
		notifiedCount: {
			type: Number,
			default: 0,
		},
	},
	{
		timestamps: true,
	},
)

eventAlbumSchema.index({ eventId: 1, createdAt: -1 })

export const EventAlbums: Model<IEventAlbum> =
	dbconn.models["EventAlbums"] || dbconn.model("EventAlbums", eventAlbumSchema, "event-albums")
