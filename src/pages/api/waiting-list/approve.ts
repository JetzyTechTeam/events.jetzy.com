import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { EventTracker } from "@/models/events/event-tracker"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { sendTicketConfirmation, sendWaitingListApproval } from "@/lib/send-grid"
import { BookingStatus } from "@/models/events/types"
import Stripe from "stripe"
import mongoose from "mongoose"

// Initialize Stripe
const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[waiting-list/approve] Database not connected, attempting to connect...")
			try {
				await Promise.race([
					dbconn.asPromise(),
					new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 30000)),
				])
				console.log("[waiting-list/approve] Database connected successfully")
			} catch (connError: any) {
				console.error("[waiting-list/approve] Database connection failed:", connError.message)
				return sendResponse(res, null, "Database connection failed. Please try again later.", false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}

		const { waitingListId, eventName } = req.body

		if (!waitingListId) {
			return sendResponse(res, null, "Waiting list ID is required", false, ResCode.BAD_REQUEST)
		}

		// Find the waiting list entry
		const waitingListEntry = await WaitingList.findById(waitingListId)
		
		if (!waitingListEntry) {
			return sendResponse(res, null, "Waiting list entry not found", false, ResCode.NOT_FOUND)
		}

		// Get the event details
		const event = await Events.findById(waitingListEntry.eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Check event capacity before approving
		const eventTracker = await EventTracker.findOne({ eventId: waitingListEntry.eventId })
		if (!eventTracker) {
			return sendResponse(res, null, "Event tracker not found", false, ResCode.NOT_FOUND)
		}

		// Calculate total tickets requested by this waiting list user
		const requestedTickets = waitingListEntry.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
		
		// Calculate actual booked tickets from confirmed bookings (excluding cancelled)
		// This ensures accuracy even if the counter gets out of sync
		// Ensure eventId is an ObjectId
		const eventObjectId = new mongoose.Types.ObjectId(waitingListEntry.eventId.toString())
		
		const confirmedBookings = await Bookings.find({
			eventId: eventObjectId,
			status: { $in: [BookingStatus.CONFIRMED, BookingStatus.APPROVED] },
			isDeleted: false,
		})
		
		const actualBookedTickets = confirmedBookings.reduce((sum, booking) => {
			return sum + booking.tickets.reduce((ticketSum, ticket) => ticketSum + ticket.quantity, 0)
		}, 0)
		
		console.log("[waiting-list/approve] Capacity check:", {
			eventId: waitingListEntry.eventId.toString(),
			eventCapacity: event.capacity,
			actualBookedTickets,
			confirmedBookingsCount: confirmedBookings.length,
		})
		
		// Check if adding these tickets would exceed capacity
		// Use event.capacity (source of truth) instead of eventTracker.eventCapacity (may be stale)
		// If event.capacity is 0, it means unlimited capacity
		if (event.capacity > 0 && actualBookedTickets + requestedTickets > event.capacity) {
			return sendResponse(res, null, "Cannot approve: Event is at full capacity", false, ResCode.BAD_REQUEST)
		}

		// Generate booking reference
		const bookingRef = `JZ-${Math.random().toString(36).substring(2, 15)}`

		// Calculate totals
		const subTotal = waitingListEntry.tickets.reduce((sum, ticket) => sum + (ticket.price * ticket.quantity), 0)
		const tax = 0 // No tax for now
		const total = subTotal + tax

		// Determine if event is paid
		const isPaidEvent = event.isPaid && total > 0

		// Create the booking with PENDING status if paid, CONFIRMED if free
		const initialStatus = isPaidEvent ? BookingStatus.PENDING : BookingStatus.CONFIRMED
		
		const booking = await Bookings.create({
			bookingRef,
			eventId: waitingListEntry.eventId,
			tickets: waitingListEntry.tickets.map(ticket => ({
				ticketId: new mongoose.Types.ObjectId(ticket.ticketId),
				quantity: ticket.quantity
			})),
			status: initialStatus,
			customerName: `${waitingListEntry.firstName} ${waitingListEntry.lastName}`,
			customerEmail: waitingListEntry.email,
			customerPhone: waitingListEntry.phone,
			subTotal,
			tax,
			total
		})

		// Only update event tracker and generate QR code if booking is confirmed (free event)
		// For paid events, we'll update after payment
		if (!isPaidEvent) {
			// Update event tracker (already fetched above)
			const totalTicketsToAdd = waitingListEntry.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
			eventTracker.bookedTickets += totalTicketsToAdd
			await eventTracker.save()

			// Generate QR code for the booking
			try {
				console.log("Generating QR code for booking...")
				const { generateQRCodeForBooking } = await import("@/lib/qr-generator")
				const qrCode = await generateQRCodeForBooking(
					booking._id.toString(),
					waitingListEntry.eventId.toString()
				)
				
				// Update booking with QR code data
				booking.qrCodeToken = qrCode.token
				booking.qrCodeImageUrl = qrCode.imageUrl
				await booking.save()
				console.log("QR code generated and saved to booking")
			} catch (qrError: any) {
				console.error("Failed to generate QR code:", qrError.message)
				// Continue without QR code
			}

			// Send booking confirmation email for free events
			try {
				console.log("Sending booking confirmation email to:", waitingListEntry.email)
				await sendTicketConfirmation({
					event,
					firstName: waitingListEntry.firstName,
					lastName: waitingListEntry.lastName,
					email: waitingListEntry.email,
					phone: waitingListEntry.phone,
					tickets: waitingListEntry.tickets.map(ticket => ({
						name: ticket.name,
						price: ticket.price,
						quantity: ticket.quantity,
						desc: ''
					})),
					orderNumber: bookingRef,
					qrCodeImageUrl: booking.qrCodeImageUrl,
				})
				console.log("Booking confirmation email sent successfully")
			} catch (emailError) {
				console.error("Failed to send booking confirmation email:", emailError)
				// Don't fail the request if email fails
			}
		} else {
			// For paid events, create Stripe checkout session
			try {
				// Get base URL dynamically
				const protocol = req.headers['x-forwarded-proto'] || (req.headers.referer?.startsWith('https') ? 'https' : 'http')
				const host = req.headers.host || 'localhost:3000'
				const baseUrl = `${protocol}://${host}`

				// Log event tickets for debugging
				console.log("[waiting-list/approve] Event tickets:", {
					eventId: event._id.toString(),
					eventName: event.name,
					ticketsCount: event.tickets?.length || 0,
					tickets: event.tickets?.map((t: any) => ({
						id: t._id?.toString(),
						name: t.name,
						price: t.price,
						hasStripeProductId: !!t.stripeProductId,
						stripeProductId: t.stripeProductId,
						disabled: t.disabled,
					})) || [],
				})

				// Log waiting list tickets for debugging
				console.log("[waiting-list/approve] Waiting list tickets:", {
					tickets: waitingListEntry.tickets.map((t: any) => ({
						ticketId: t.ticketId?.toString() || t.ticketId,
						name: t.name,
						price: t.price,
						quantity: t.quantity,
					})),
				})

				// Create Stripe line items from tickets
				const lineItems = waitingListEntry.tickets.map(ticket => {
					// Convert ticketId to string for comparison
					const ticketIdStr = ticket.ticketId?.toString() || ticket.ticketId
					
					// Find the ticket in the event to get the Stripe product ID
					// First try by ID (including disabled tickets)
					let eventTicket = event.tickets?.find((t: any) => {
						if (!t._id) return false
						// Try multiple ways to match the ticket
						const eventTicketIdStr = t._id.toString()
						// Normalize both IDs to strings for comparison
						const normalizedTicketId = String(ticketIdStr).trim()
						const normalizedEventId = String(eventTicketIdStr).trim()
						return normalizedEventId === normalizedTicketId ||
						       (ticket.ticketId && t._id && t._id.equals && typeof t._id.equals === 'function' && t._id.equals(new mongoose.Types.ObjectId(ticketIdStr)))
					})

					// If not found by ID, try to find by name (fallback) - prefer non-disabled tickets
					if (!eventTicket && ticket.name) {
						// First try non-disabled tickets
						eventTicket = event.tickets?.find((t: any) => {
							return t.name === ticket.name && !t.disabled
						})
						// If still not found, try disabled tickets
						if (!eventTicket) {
							eventTicket = event.tickets?.find((t: any) => {
								return t.name === ticket.name
							})
						}
						if (eventTicket) {
							console.log("[waiting-list/approve] Found ticket by name fallback:", {
								waitingListTicketName: ticket.name,
								waitingListTicketId: ticketIdStr,
								eventTicketId: eventTicket._id?.toString(),
								eventTicketName: eventTicket.name,
								eventTicketDisabled: eventTicket.disabled,
							})
						}
					}
					
					if (!eventTicket) {
						console.error("[waiting-list/approve] Ticket not found in event:", {
							waitingListTicketId: ticketIdStr,
							waitingListTicketName: ticket.name,
							waitingListTicketPrice: ticket.price,
							eventTickets: event.tickets?.map((t: any) => ({
								id: t._id?.toString(),
								name: t.name,
								price: t.price,
								hasStripeProductId: !!t.stripeProductId,
								stripeProductId: t.stripeProductId,
								disabled: t.disabled,
							})) || [],
							eventId: event._id.toString(),
							eventName: event.name,
						})
						throw new Error(`Ticket "${ticket.name || 'Unknown'}" (ID: ${ticketIdStr}) not found in event "${event.name}". The ticket may have been deleted or modified. Please remove this user from the waiting list and ask them to rejoin.`)
					}
					
					if (!eventTicket.stripeProductId) {
						console.error("[waiting-list/approve] Stripe product ID missing for ticket:", {
							waitingListTicketId: ticketIdStr,
							waitingListTicketName: ticket.name,
							eventTicketId: eventTicket._id?.toString(),
							eventTicketName: eventTicket.name,
							eventTicketPrice: eventTicket.price,
							eventTicketDisabled: eventTicket.disabled,
						})
						throw new Error(`Stripe product ID not found for ticket "${eventTicket.name}". Please ensure the ticket has a valid price set. You may need to update the ticket price in the event settings.`)
					}
					
					return {
						price: eventTicket.stripeProductId,
						quantity: ticket.quantity,
					}
				})

				// Create Stripe checkout session
				// Set expiration to 24 hours (86400 seconds) - maximum allowed by Stripe
				const session = await stripe.checkout.sessions.create({
					payment_method_types: ['card'],
					line_items: lineItems,
					mode: 'payment',
					success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&event=${encodeURIComponent(JSON.stringify({ name: event.name, slug: event.slug }))}`,
					cancel_url: `${baseUrl}/cancel?returnUrl=${encodeURIComponent(`${baseUrl}/${event.slug}`)}`,
					client_reference_id: bookingRef,
					customer_email: waitingListEntry.email,
					expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now (max allowed)
					metadata: {
						eventId: waitingListEntry.eventId.toString(),
						firstName: waitingListEntry.firstName,
						lastName: waitingListEntry.lastName,
						email: waitingListEntry.email,
						phone: waitingListEntry.phone,
						tickets: JSON.stringify(waitingListEntry.tickets),
						bookingId: booking._id.toString(),
						fromWaitingList: 'true',
					},
				})
				
				console.log("[waiting-list/approve] Created Stripe session:", {
					id: session.id,
					url: session.url,
					expires_at: session.expires_at,
					expires_at_date: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
				})

				// Update booking with Stripe session ID
				booking.stripeSessionId = session.id
				await booking.save()

				// Send waiting list approval email with payment link
				try {
					console.log("Sending waiting list approval email with payment link to:", waitingListEntry.email)
					await sendWaitingListApproval({
						firstName: waitingListEntry.firstName,
						lastName: waitingListEntry.lastName,
						email: waitingListEntry.email,
						eventName: event.name,
						tickets: waitingListEntry.tickets.map(ticket => ({
							name: ticket.name,
							price: ticket.price,
							quantity: ticket.quantity,
						})),
						paymentUrl: session.url || undefined,
					})
					console.log("Waiting list approval email sent successfully")
				} catch (emailError) {
					console.error("Failed to send waiting list approval email:", emailError)
					// Don't fail the request if email fails
				}

				// Update waiting list status to approved BEFORE returning
				await WaitingList.findByIdAndUpdate(waitingListId, { status: 'approved' })

				return sendResponse(res, { 
					success: true, 
					booking: booking,
					bookingRef: bookingRef,
					paymentUrl: session.url,
					requiresPayment: true
				}, "User approved, payment link generated. User needs to complete payment.", true, ResCode.OK)
			} catch (stripeError: any) {
				console.error("Failed to create Stripe checkout session:", stripeError)
				// Delete the booking if Stripe session creation fails
				await Bookings.findByIdAndDelete(booking._id)
				return sendResponse(res, null, `Failed to create payment link: ${stripeError.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}

		// Update waiting list status to approved (for free events)
		await WaitingList.findByIdAndUpdate(waitingListId, { status: 'approved' })

		return sendResponse(res, { 
			success: true, 
			booking: booking,
			bookingRef: bookingRef,
			requiresPayment: false
		}, "User approved, booking created and confirmation email sent", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error approving waiting list user:", error)
		const errorMessage = error?.message || "An unexpected error occurred while approving the user"
		return sendResponse(res, null, errorMessage, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
