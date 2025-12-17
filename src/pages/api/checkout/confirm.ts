import { sendTicketConfirmation } from "@/lib/send-grid"
import { uniqueId } from "@/lib/utils"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"
import { Users } from "@/models/userModal"

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
		console.log("[checkout/confirm] Method not allowed:", req.method)
		return res.status(405).json({ message: "Method not allowed" })
	}

	try {
		console.log("[checkout/confirm] Request received")
		
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[checkout/confirm] Database not connected, attempting to connect...")
			try {
				await Promise.race([
					dbconn.asPromise(),
					new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 30000)),
				])
				console.log("[checkout/confirm] Database connected successfully")
			} catch (connError: any) {
				console.error("[checkout/confirm] Database connection failed:", connError.message)
				return res.status(500).json({ message: "Database connection failed. Please try again later." })
			}
		}
		
		const { session_id } = req.query
		console.log("[checkout/confirm] Session ID:", session_id)
		
		if (!session_id || typeof session_id !== "string") {
			console.log("[checkout/confirm] Invalid session ID")
			return res.status(400).json({ message: "Invalid session ID" })
		}

		console.log("[checkout/confirm] Retrieving Stripe session...")
		const session = await stripe.checkout.sessions.retrieve(session_id)
		console.log("[checkout/confirm] Stripe session retrieved. Payment status:", session.payment_status)
		
		if (!session) {
			console.log("[checkout/confirm] Session not found")
			return res.status(404).json({ message: "Session not found" })
		}

		// get the session metadata
		const metadata = session.metadata as SessionMetadata

		// get the tickets from the metadata
		const tickets = JSON.parse(metadata.tickets) as TicketsProps

		// Create a booking record if the payment was successful
		if (session.payment_status === "paid") {
			console.log("[checkout/confirm] Payment successful, creating booking...")
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
			console.log("[checkout/confirm] Booking created:", booking.bookingRef)

			// update the event tracker
			console.log("[checkout/confirm] Updating event tracker...")
			await booking.updateEventTracker()
			console.log("[checkout/confirm] Event tracker updated")

			console.log("[checkout/confirm] Finding event:", metadata.eventId)
			const event = await Events.findById(metadata.eventId)
			if (!event) {
				console.log("[checkout/confirm] Event not found for ID:", metadata.eventId)
				return res.status(404).json({ message: "Event not found" })
			}
			console.log("[checkout/confirm] Event found:", event.name)

			// Check if user was newly created (has password) to include account info in email
			let isNewUser = false
			try {
				const user = await Users.findOne({ email: metadata.email.toLowerCase() })
				// If user exists and has a password, check if they were created recently
				if (user && user.password && user.password.trim() !== "") {
					// Check if user was created recently (within last 10 minutes)
					// This covers the time from checkout form submission to payment confirmation
					let userCreatedAt: Date
					if ((user as any).createdAt) {
						userCreatedAt = new Date((user as any).createdAt)
					} else {
						// Fallback: use ObjectId timestamp (MongoDB ObjectId contains creation timestamp)
						const objectId = user._id as any
						if (objectId && typeof objectId.getTimestamp === 'function') {
							userCreatedAt = objectId.getTimestamp()
						} else {
							// If we can't determine creation time, assume not new
							userCreatedAt = new Date(0)
						}
					}
					const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
					if (userCreatedAt > tenMinutesAgo) {
						isNewUser = true
						console.log("User was created recently, will include account info in email")
					}
				}
			} catch (userCheckError) {
				console.error("Error checking user status:", userCheckError)
				// Continue with email sending even if user check fails
			}

			// send email to the customer
			try {
				console.log("Sending ticket confirmation email to:", metadata.email, "isNewUser:", isNewUser)
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
					isNewUser,
				})
				console.log("Ticket confirmation email sent successfully")
			} catch (emailError) {
				console.error("Failed to send ticket confirmation email:", emailError)
				// Don't fail the request if email fails
			}
		}

		console.log("[checkout/confirm] Sending successful response")
		return res.status(200).json(session)
	} catch (error: any) {
		console.error("[checkout/confirm] Error:", error.message || error)
		console.error("[checkout/confirm] Stack trace:", error.stack)
		return res.status(500).json({ message: "Internal server error", error: error.message })
	}
}
