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
