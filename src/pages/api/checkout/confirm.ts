import { sendTicketConfirmation } from "@/lib/send-grid"
import { uniqueId } from "@/lib/utils"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

type SessionMetadata = {
	eventId: string
	firstName: string
	lastName: string
	email: string
	phone: string
	tickets: string // JSON stringified array of ticket objects
}

type TicketsProps = Array<{
	id: number
	name: string
	price: number
	quantity: number
	isSelected: boolean
	desc: string
	eventId: string
	priceId: string
}>

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	try {
		const { session_id } = req.query
		if (!session_id || typeof session_id !== "string") {
			return res.status(400).json({ message: "Invalid session ID" })
		}

		const session = await stripe.checkout.sessions.retrieve(session_id)
		if (!session) {
			return res.status(404).json({ message: "Session not found" })
		}

		// get the session metadata
		const metadata = session.metadata as SessionMetadata

		// get the tickets from the metadata
		const tickets = JSON.parse(metadata.tickets) as TicketsProps

		// Create a booking record if the payment was successful
		if (session.payment_status === "paid") {
			const booking = await Bookings.create({
				status: BookingStatus.CONFIRMED,
				eventId: metadata.eventId,
				bookingRef: `JZ-${session.client_reference_id}`,
				customerName: `${metadata.firstName} ${metadata.lastName}`,
				customerEmail: metadata.email,
				customerPhone: metadata.phone,
				tickets: tickets.map((ticket) => ({
					ticketId: ticket.id,
					quantity: ticket.quantity,
				})),
				subTotal: tickets.reduce((acc, curr) => acc + curr.price * curr.quantity, 0),
				total: session.amount_total ? session.amount_total / 100 : 0,
			})

			// update the event tracker
			await booking.updateEventTracker()

			const event = await Events.findById(metadata.eventId)
			if (!event) {
				return res.status(404).json({ message: "Event not found" })
			}

			// send email to the customer
			await sendTicketConfirmation({
				event,
				firstName: metadata.firstName,
				lastName: metadata.lastName,
				email: metadata.email,
				phone: metadata.phone,
				tickets: tickets.map((ticket) => ({
					name: ticket.name,
					price: ticket.price,
					quantity: ticket.quantity,
					desc: ticket.desc,
				})),
				orderNumber: `JZ-${session.client_reference_id}`,
			})
		}

		return res.status(200).json(session)
	} catch (error) {
		console.error("Error retrieving session:", error)
		return res.status(500).json({ message: "Internal server error" })
	}
}
