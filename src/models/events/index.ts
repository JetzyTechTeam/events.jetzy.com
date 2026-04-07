import { dbconn } from "@Jetzy/configs/database"
import { Model, Schema } from "mongoose"
import { IEvent, IEventTicket } from "./types"
import { EventTracker } from "./event-tracker"
import { Bookings } from "./bookings"

const eventTicketsSchema = new Schema<IEventTicket>(
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
			required: false,
		},
		stripeProductId: {
			type: String,
			required: true,
		},
	},
	{ timestamps: true },
)

const customQuestionSchema = new Schema(
	{
		id: { type: String, required: true },
		title: { type: String, required: true },
		type: { type: String, enum: ['text', 'options', 'social_profile', 'company', 'checkbox', 'terms', 'mobile', 'website'], required: true },
		isRequired: { type: Boolean, default: false },
		responseLength: { type: String, enum: ['short', 'multi-line'], required: false },
		selectionType: { type: String, enum: ['single', 'multiple'], required: false },
		options: { type: [String], required: false },
		platform: { type: String, required: false },
		collectJobTitle: { type: Boolean, required: false },
		termsContentType: { type: String, enum: ['text', 'link'], required: false },
		termsContent: { type: String, required: false },
		collectSignature: { type: Boolean, required: false },
	},
	{ _id: false }
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
		venueName: {
			type: String,
			required: false,
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
			type: [eventTicketsSchema],
			required: false,
		},

		questions: {
			type: [customQuestionSchema],
			required: false,
			default: [],
		},

		isDeleted: {
			type: Boolean,
			default: false,
		},
		feedbackFormUrl: {
			type: String,
			required: false,
		},
		thankYouEmailSentAt: {
			type: Date,
			required: false,
		},
		benefits: {
			type: String,
			default: "",
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

// Activity Sync Middleware
eventsSchema.post("save", async function (doc) {
	try {
		const { upsertActivityFromEvent } = await import("@/lib/activity-sync")
		await upsertActivityFromEvent(doc)
	} catch (error) {
		console.error("Error in post-save activity sync:", error)
	}
})

eventsSchema.post("findOneAndUpdate", async function (doc) {
	try {
		if (doc) {
			const { upsertActivityFromEvent } = await import("@/lib/activity-sync")
			await upsertActivityFromEvent(doc)
		}
	} catch (error) {
		console.error("Error in post-findOneAndUpdate activity sync:", error)
	}
})

eventsSchema.post("findOneAndDelete", async function (doc) {
	try {
		if (doc) {
			const { deleteActivityByEventId } = await import("@/lib/activity-sync")
			await deleteActivityByEventId(doc._id)
		}
	} catch (error) {
		console.error("Error in post-findOneAndDelete activity sync:", error)
	}
})

// Export the user model
export const Events: Model<IEvent> = dbconn.models["Events"] || dbconn.model("Events", eventsSchema)
