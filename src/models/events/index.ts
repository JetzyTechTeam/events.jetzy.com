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
		// Per-ticket approval override. Deliberately has NO default: `undefined` means
		// "inherit event.requireApproval", which is what keeps every pre-existing ticket
		// working without a migration. A default of `false` would pin legacy tickets to
		// OFF the first time their event is saved.
		requireApproval: {
			type: Boolean,
			required: false,
		},
		// Which memberships this ticket SELLS alongside the ticket itself — Jetzy Premium,
		// Full Concierge, or both. A buyer who doesn't already hold one is charged the ticket
		// price PLUS the first period of each; the subscriptions themselves are created after
		// the charge (see `src/lib/premium-bundle.ts`).
		//
		// No default and no `enum` here on purpose: `undefined` means "fall back to
		// `includesPremium`", which is what lets every ticket saved before the second product
		// existed keep working with no migration. Validation happens in `sanitizeMembershipKeys`
		// on the way in, so an unknown key can never reach Stripe.
		memberships: {
			type: [String],
			required: false,
		},
		// Which billing interval the bundled membership is sold at — "month" or "year".
		//
		// No default and no enum, same reasoning as `memberships` above: `undefined` means
		// monthly, which is what every ticket saved before Jetzy Premium had an annual price
		// means. Adding `default: "month"` would write the field on the next save of every
		// legacy ticket for no gain.
		//
		// One interval for the whole ticket rather than one per membership — only Premium is
		// sold annually. Resolve with `ticketMembershipInterval()` from
		// `src/lib/premium-bundle.ts`; never read this field directly.
		membershipInterval: {
			type: String,
			required: false,
		},
		// DEPRECATED — superseded by `memberships`. Read only as the fallback above; never
		// written for new tickets. Kept so live documents and the mobile app are undisturbed,
		// same treatment as `premium` / `privateAccessCode`.
		//
		// Historical note: this was once documented as mutually exclusive with
		// `requireApproval`, because there is no manual capture in Stripe subscription mode.
		// That constraint is gone — a bundled ticket is now always sold as a `payment`-mode
		// session and the subscription is created afterwards, so it can be held for approval
		// like any other.
		includesPremium: {
			type: Boolean,
			default: false,
		},
	},
	{ timestamps: true },
)

const customQuestionSchema = new Schema(
	{
		id: { type: String, required: true },
		title: { type: String, required: true },
		type: { type: String, enum: ['text', 'options', 'multiple_choice', 'social_profile', 'company', 'checkbox', 'terms', 'mobile', 'website'], required: true },
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

const datePollOptionSchema = new Schema(
	{
		id: { type: String, required: true },
		date: { type: String, required: true },
		time: { type: String, required: false },
		label: { type: String, required: false },
		votes: { type: [String], default: [] },
	},
	{ _id: false },
)

const datePollSchema = new Schema(
	{
		isActive: { type: Boolean, default: false },
		question: { type: String, required: false },
		options: { type: [datePollOptionSchema], default: [] },
	},
	{ _id: false },
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
		// Every slug this event has previously used. Renaming an event pushes the old
		// value here so links already in the wild — RSVP emails, printed QR codes, links
		// people pasted into chats — keep resolving via a redirect instead of 404ing.
		// Deliberately NOT unique-indexed: uniqueness has to hold across `slug` AND
		// `previousSlugs` together, which a multikey unique index can't express. That
		// rule lives in `buildUniqueSlug` (src/lib/event-slug.ts) instead.
		previousSlugs: {
			type: [String],
			default: [],
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
		// Admin moderation gate for public events. Private events are always
		// auto-approved. Defaults to 'approved' so events that existed before this
		// field was introduced aren't retroactively hidden.
		adminApprovalStatus: {
			type: String,
			enum: ["pending", "approved"],
			default: "approved",
		},
		status: {
			type: String,
			enum: ['draft', 'published'],
			default: 'published',
			required: false,
		},
		// Shadow "draft 2" for a PUBLISHED event: autosaved, in-progress edits held
		// separately so the live event is untouched until the organizer presses Save.
		// Cleared ($unset) on a real update. `select: false` keeps the unpublished
		// content out of every query by default — only the owner/admin-gated manage
		// page opts in via `.select('+draftRevision')`, so it never leaks publicly.
		draftRevision: {
			type: Schema.Types.Mixed,
			required: false,
			select: false,
		},
		startsOn: {
			type: Date,
			required: false,
		},
		endsOn: {
			type: Date,
			required: false,
		},
		// Whether the organizer set an explicit time (vs a date-only event). Undefined on legacy events = treat as having a time.
		hasStartTime: {
			type: Boolean,
			required: false,
		},
		hasEndTime: {
			type: Boolean,
			required: false,
		},
		timezone: {
			type: String,
			required: false,
			default: "UTC",
		},
		location: {
			type: String,
			required: false,
			default: '',
		},
		venueName: {
			type: String,
			required: false,
		},
		// Arrival instructions, e.g. "West side at 69th Street". EMAIL ONLY — deliberately
		// not rendered on the public event page: it's useful to someone on their way and
		// noise to someone browsing. Exists because hosts were appending this to the
		// location field for want of anywhere to put it, which corrupted the address.
		entrance: {
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
			required: false,
			default: '',
		},

		images: {
			type: [String],
			required: false,
		},

		videos: {
			type: [String],
			default: [],
			required: false,
		},

		// Banner order across images + videos. No default — absent means the legacy
		// images-then-videos order. See IEvent.mediaOrder and `eventMedia`.
		mediaOrder: {
			type: [String],
			required: false,
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
		locationDisclosedAfterBooking: {
			type: Boolean,
			default: false,
		},
		showOnMobile: {
			type: Boolean,
			default: true,
		},
		// DEPRECATED — the "Premium Event" concept was retired. It used to gate who could HOST
		// and carry a member discount; membership is now SOLD per ticket via
		// `eventTicketsSchema.includesPremium` instead of discounting one. Nothing reads or
		// writes either field any more. Kept so existing documents (and the mobile app reading
		// the same collection) are undisturbed; safe to drop later, like `privateAccessCode`.
		premium: {
			type: Boolean,
			default: false,
		},
		// DEPRECATED — see `premium` above. Historical bookings keep their own copy of the rate
		// in `Bookings.premiumMemberDiscountPercentage` so past receipts still itemise.
		premiumMemberDiscountPercentage: {
			type: Number,
			default: 0,
			min: 0,
			max: 100,
		},
		// DEPRECATED — no longer generated or enforced. Private events are unlisted rather
		// than invite-only, so nothing reads this. Kept so existing documents (and the
		// mobile app reading the same collection) are undisturbed; safe to drop later.
		privateAccessCode: {
			type: String,
			required: false,
		},
		datePoll: {
			type: datePollSchema,
			required: false,
		},
		ownerId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: false,
			index: true,
		},
		interests: {
			type: [Schema.Types.ObjectId],
			required: false,
			default: [],
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

// Old-slug lookups run on every 404-bound request to `/[slug]`, so the alias array
// needs its own (multikey, non-unique) index.
eventsSchema.index({ previousSlugs: 1 })

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
