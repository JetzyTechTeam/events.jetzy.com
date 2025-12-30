import { Model, Schema } from "mongoose"
import { BookingStatus, IBookings } from "./types"
import { dbconn } from "@/configs/database"
import { EventTracker } from "./event-tracker"
import { Events } from "."

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
		isDeleted: {
			type: Boolean,
			default: false,
		},
		qrCodeToken: {
			type: String,
			required: false,
			unique: true,
			sparse: true,
			index: true,
		},
		qrCodeImageUrl: {
			type: String,
			required: false,
		},
		referralCode: {
			type: String,
			required: false,
			index: true,
		},
		discountAmount: {
			type: Number,
			default: 0,
		},
		stripeSessionId: {
			type: String,
			required: false,
			index: true,
		},
	},
	{
		timestamps: true,
		methods: {
			// Whenever a new booking is made we need to update the event tracker
			async updateEventTracker() {
				// Update EventTracker
				const eventTracker = await EventTracker.findOne({ eventId: this.eventId })
				if (eventTracker) {
					eventTracker.bookedTickets += this.tickets.reduce((acc, curr) => acc + curr.quantity, 0)
					await eventTracker.save()
				}

				// Update quantitySold for each ticket in the Event
				if (this.tickets && this.tickets.length > 0) {
					for (const bookedTicket of this.tickets) {
						await Events.updateOne(
							{
								_id: this.eventId,
								"tickets._id": bookedTicket.ticketId
							},
							{
								$inc: { "tickets.$.quantitySold": bookedTicket.quantity }
							}
						)
					}
				}
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
