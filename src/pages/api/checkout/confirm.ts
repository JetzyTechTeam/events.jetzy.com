import { sendTicketConfirmation } from "@/lib/send-grid"
import { uniqueId } from "@/lib/utils"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"
import { createBookingConfirmationNotification } from "@/lib/notification-helper"
import { Users } from "@/models/userModal"
import { connectDB } from "@/lib/connect-db"

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
		// Ensure database connection
		await connectDB()
		console.log("Database connected for payment confirmation")
		
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
			console.log("=== BOOKING CONFIRMATION STARTED ===")
			console.log("Payment successful for session:", session_id)
			console.log("Customer email:", metadata.email)
			
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
			console.log("Booking created with ID:", booking._id)

			// update the event tracker
			await booking.updateEventTracker()

			const event = await Events.findById(metadata.eventId)
			if (!event) {
				return res.status(404).json({ message: "Event not found" })
			}

			// send email to the customer
			try {
				console.log("Sending ticket confirmation email to:", metadata.email)
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
				console.log("Ticket confirmation email sent successfully")
			} catch (emailError) {
				console.error("Failed to send ticket confirmation email:", emailError)
				// Don't fail the request if email fails
			}

			// Create notification for user
			try {
				// Find user by email
				console.log("=== NOTIFICATION CREATION STARTED ===")
				console.log("Looking up user with email:", metadata.email)
				
				const user = await Users.findOne({ email: metadata.email })

				if (user) {
					console.log("✅ User found with ID:", user._id)
					console.log("User details:", {
						id: user._id,
						email: user.email,
						firstName: user.firstName,
						lastName: user.lastName
					})
					
					const notificationResult = await createBookingConfirmationNotification(
						user._id, 
						booking._id, 
						event.name, 
						`JZ-${session.client_reference_id}`
					)
					
					console.log("✅ Notification creation result:", notificationResult ? "SUCCESS" : "FAILED")
					console.log("Booking notification created successfully for user:", user._id)
				} else {
					console.error("❌ USER NOT FOUND in database with email:", metadata.email)
					console.error("This user needs to be created first!")
					console.error("Notification was NOT created")
				}
			} catch (notificationError) {
				console.error("❌ EXCEPTION in notification creation:", notificationError)
				console.error("Error details:", {
					message: notificationError instanceof Error ? notificationError.message : "Unknown error",
					stack: notificationError instanceof Error ? notificationError.stack : "No stack trace"
				})
				// Don't fail the request if notification fails
			}
			
			console.log("=== BOOKING CONFIRMATION COMPLETED ===")
		}

		return res.status(200).json(session)
	} catch (error) {
		console.error("Error retrieving session:", error)
		return res.status(500).json({ message: "Internal server error" })
	}
}
