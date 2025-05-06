import { dbconn } from "@Jetzy/configs/database"
import { Model, Schema } from "mongoose"
import { IEvent, IEventTicket } from "./types"
import { EventTracker } from "./event-tracker"
import { Bookings } from "./bookings"

const eventTciketsSchema = new Schema<IEventTicket>(
	{
		name: {
			type: String,
			required: true,
		},
		price: {
			type: Number,
			required: true,
		},
		desc: {
			type: String,
			required: true,
		},
		stripeProductId: {
			type: String,
			required: true,
		},
	},
	{ timestamps: true },
)

// Define the  schema
const eventsSchema = new Schema<IEvent>(
	{
		slug: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		name: {
			type: String,
			required: true,
		},
		privacy: {
			type: String,
			enum: ["public", "private"],
			default: 'public',
			required: true,
		},
		showParticipants: {
			type: Boolean,
			required: true,
			default: false,
		},
		startsOn: {
			type: Date,
			required: true,
		},
		endsOn: {
			type: Date,
			required: true,
		},
		timezone: {
				type: String,
				required: true,
		}, 
		location: {
			type: String,
			required: true,
		},
		coordinates: {
			long: {
				type: Number,
				required: false,
			},
			lat: {
				type: Number,
				required: false,
			},
			placeId: {
				type: String,
				required: false,
			},
		},
		isPaid: {
			type: Boolean,
			required: true,
			default: false,
		},

		desc: {
			type: String,
			required: true,
		},

		images: {
			type: [String],
			required: true,
		},

		capacity: {
			type: Number,
			default: 0, // 0 means unlimited
		},

		requireApproval: {
			type: Boolean,
			default: false, // false means no approval required
		},

		tickets: {
			type: [eventTciketsSchema],
			required: false,
		},

		isDeleted: {
			type: Boolean,
			default: false,
		},
	},
	{
		timestamps: true,
		methods: {
			createEventTracker: async function (eventCapacity: number) {
				const eventTracker = await EventTracker.create({
					eventId: this._id,
					eventCapacity,
				})
				return eventTracker
			},

			// Get Bookings for this event
			getBookings: async function () {
				const bookings = await Bookings.find({ eventId: this._id, isDeleted: false })
				return bookings
			},

			// Delete the event tracker
			deleteTracker: async function () {
				await EventTracker.findOneAndDelete({ eventId: this._id })
			},
		},
	},
)

// Export the user model
export const Events: Model<IEvent> = dbconn.models["Events"] || dbconn.model("Events", eventsSchema)
