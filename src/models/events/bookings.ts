import { Model, Schema } from "mongoose"
import { BookingStatus, IBookings } from "./types"
import { dbconn } from "@/configs/database"
import { EventTracker } from "./event-tracker"
import { Events } from "."

const customAnswerSchema = new Schema(
	{
		questionId: { type: String, required: true },
		answer: { type: Schema.Types.Mixed, required: true },
	},
	{ _id: false }
)

/**
 * Stripe money state for a booking. Nested rather than flattened so "this booking
 * has money attached" is a single truthy check that free bookings trivially fail,
 * and so the whole block can be stripped from API projections in one shot.
 */
const bookingPaymentSchema = new Schema(
	{
		provider: { type: String, default: "stripe" },
		checkoutSessionId: { type: String, index: true },
		paymentIntentId: { type: String, index: true },
		captureMethod: { type: String, enum: ["automatic", "manual"], default: "automatic" },
		status: {
			type: String,
			enum: ["authorized", "capturing", "captured", "canceled", "expired", "failed"],
		},
		amount: { type: Number, default: 0 }, // major units (dollars), matches booking.total
		currency: { type: String, default: "usd" },
		authorizedAt: { type: Date },
		authExpiresAt: { type: Date },
		capturedAt: { type: Date },
		canceledAt: { type: Date },
		lastError: { type: String },
	},
	{ _id: false }
)

const bookingSchema = new Schema<IBookings>(
	{
		bookingRef: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		eventId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true,
		},
		bookerUserId: {
			type: Schema.Types.ObjectId,
			required: false,
			index: true,
		},
		tickets: [
			{
				ticketId: {
					type: Schema.Types.ObjectId,
					required: true,
				},
				quantity: {
					type: Number,
					required: true,
				},
			},
		],
		status: {
			type: String,
			enum: {
				values: Object.values(BookingStatus),
				message: "Invalid booking status",
			},
			default: BookingStatus.PENDING,
		},
		customerName: {
			type: String,
			required: true,
		},
		customerEmail: {
			type: String,
			required: true,
			index: true,
		},
		customerPhone: {
			type: String,
			required: true,
		},
		subTotal: {
			type: Number,
			default: 0,
		},
		tax: {
			type: Number,
			default: 0,
		},
		total: {
			type: Number,
			default: 0,
		},
		referralCode: {
			type: String,
			required: false,
		},
		discountAmount: {
			type: Number,
			default: 0,
		},
		premiumMemberDiscountApplied: {
			type: Boolean,
			default: false,
		},
		// The two discount rates that produced `discountAmount`, stored separately so a
		// confirmation email sent later (e.g. on paid approval) can itemise Premium vs
		// referral instead of lumping them together. No default: bookings created before
		// this existed leave them undefined and fall back to a single combined line.
		referralDiscountPercentage: {
			type: Number,
			required: false,
		},
		premiumMemberDiscountPercentage: {
			type: Number,
			required: false,
		},
		customAnswers: {
			type: [customAnswerSchema],
			required: false,
			default: [],
		},
		// Absent for free bookings and for every booking predating paid approval.
		payment: {
			type: bookingPaymentSchema,
			required: false,
		},
		// Consent captured at booking time (T&C incl. agreeing to a Jetzy account)
		acceptedTerms: {
			type: Boolean,
			default: false,
		},
		acceptedTermsAt: {
			type: Date,
			required: false,
		},
		// Set when the booking is cancelled. No defaults: bookings predating this leave both
		// undefined rather than claiming they were cancelled by a guest at the epoch.
		cancelledAt: {
			type: Date,
			required: false,
		},
		cancelledBy: {
			type: String,
			enum: ["guest", "host", "admin"],
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
			// Whenever a new booking is made we need to update the event tracker
			async updateEventTracker() {
				const eventTracker = await EventTracker.findOne({ eventId: this.eventId })
				if (!eventTracker) return

				eventTracker.bookedTickets += this.tickets.reduce((acc, curr) => acc + curr.quantity, 0)
				await eventTracker.save()
			},

			// Get the event details
			async getEvent() {
				const event = await Events.findOne({ _id: this.eventId }, "_id name location startsOn endsOn tickets")
				if (!event) return null
				return event
			},
		},
	},
)

export const Bookings: Model<IBookings> = dbconn.models["Bookings"] || dbconn.model<IBookings>("Bookings", bookingSchema)
