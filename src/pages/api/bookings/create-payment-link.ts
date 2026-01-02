import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import Stripe from "stripe"
import mongoose from "mongoose"

const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[bookings/create-payment-link] Database not connected, attempting to connect...")
			try {
				await Promise.race([
					dbconn.asPromise(),
					new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 30000)),
				])
				console.log("[bookings/create-payment-link] Database connected successfully")
			} catch (connError: any) {
				console.error("[bookings/create-payment-link] Database connection failed:", connError.message)
				return sendResponse(res, null, "Database connection failed. Please try again later.", false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}

		const { bookingId, sendEmail } = req.body

		if (!bookingId || typeof bookingId !== "string") {
			return sendResponse(res, null, "Booking ID is required", false, ResCode.BAD_REQUEST)
		}

		console.log("[bookings/create-payment-link] Creating new payment link for booking:", bookingId)

		// Find the booking
		const booking = await Bookings.findById(bookingId)

		if (!booking || booking.isDeleted) {
			return sendResponse(res, null, "Booking not found", false, ResCode.NOT_FOUND)
		}

		// Only allow creating new payment links for pending bookings
		if (booking.status !== "pending") {
			return sendResponse(res, null, "Payment link can only be created for pending bookings", false, ResCode.BAD_REQUEST)
		}

		// Validate booking has tickets
		if (!booking.tickets || booking.tickets.length === 0) {
			console.error("[bookings/create-payment-link] Booking has no tickets:", {
				bookingId: booking._id.toString(),
				bookingRef: booking.bookingRef,
			})
			return sendResponse(res, null, "Booking has no tickets", false, ResCode.BAD_REQUEST)
		}

		// Get the event (ensure we get tickets array)
		const event = await Events.findById(booking.eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		if (!event.slug) {
			return sendResponse(res, null, "Event configuration error: missing slug", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// Debug: Log event tickets structure
		console.log("[bookings/create-payment-link] Event tickets:", {
			eventId: event._id.toString(),
			ticketsCount: event.tickets?.length || 0,
			ticketIds: event.tickets?.map((t: any) => t._id?.toString()) || [],
			bookingTicketIds: booking.tickets.map(t => t.ticketId?.toString() || String(t.ticketId)),
		})

		// Get base URL
		let baseUrl: string | null = null
		
		if (req.headers.host) {
			const protocol = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim() || 
				(req.headers['x-forwarded-ssl'] === 'on' ? 'https' : null) ||
				(req.headers.host.includes('localhost') || req.headers.host.includes('127.0.0.1') ? 'http' : 'https')
			
			baseUrl = `${protocol}://${req.headers.host}`
		} else {
			baseUrl = process.env.NEXT_PUBLIC_URL || null
		}
		
		if (!baseUrl) {
			return sendResponse(res, null, "Cannot determine base URL", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		const cleanBaseUrl = baseUrl.replace(/\/$/, '')
		
		// Validate event has tickets
		if (!event.tickets || !Array.isArray(event.tickets) || event.tickets.length === 0) {
			console.error("[bookings/create-payment-link] Event has no tickets:", {
				eventId: event._id.toString(),
				eventName: event.name,
				hasTickets: !!event.tickets,
				ticketsType: typeof event.tickets,
				ticketsLength: Array.isArray(event.tickets) ? event.tickets.length : 'not an array',
			})
			return sendResponse(res, null, "Event has no tickets configured", false, ResCode.BAD_REQUEST)
		}

		// Create Stripe line items from booking tickets
		const lineItems: Array<{ price: string; quantity: number }> = []
		const missingTickets: string[] = []
		
		for (const ticket of booking.tickets) {
			try {
				// Convert ticketId to string for comparison - handle both ObjectId and string
				let ticketIdStr: string
				if (ticket.ticketId instanceof mongoose.Types.ObjectId) {
					ticketIdStr = ticket.ticketId.toString()
				} else if (typeof ticket.ticketId === 'string') {
					ticketIdStr = ticket.ticketId
				} else {
					ticketIdStr = String(ticket.ticketId)
				}
				
				// Normalize ticket ID (remove any whitespace)
				ticketIdStr = ticketIdStr.trim()
				
				// Find the ticket in the event to get the Stripe product ID
				const eventTicket = event.tickets.find((t: any) => {
					if (!t || !t._id) return false
					
					// Try ObjectId.equals() first (most reliable for ObjectId comparison)
					if (ticket.ticketId instanceof mongoose.Types.ObjectId && t._id instanceof mongoose.Types.ObjectId) {
						if (t._id.equals(ticket.ticketId)) {
							return true
						}
					}
					
					// Fallback to string comparison
					// Convert event ticket ID to string and normalize
					let eventTicketIdStr: string
					if (t._id instanceof mongoose.Types.ObjectId) {
						eventTicketIdStr = t._id.toString()
					} else if (typeof t._id === 'string') {
						eventTicketIdStr = t._id
					} else {
						eventTicketIdStr = String(t._id)
					}
					eventTicketIdStr = eventTicketIdStr.trim()
					// Compare normalized strings
					return eventTicketIdStr === ticketIdStr
				})
				
				if (!eventTicket) {
					missingTickets.push(ticketIdStr)
					const eventTicketIds = event.tickets.map((t: any) => t._id?.toString()).filter(Boolean)
					console.error("[bookings/create-payment-link] Ticket not found in event:", {
						bookingTicketId: ticketIdStr,
						bookingTicketIdType: typeof ticket.ticketId,
						bookingTicketIdRaw: ticket.ticketId,
						eventTicketIds: eventTicketIds,
						ticketsMatch: eventTicketIds.includes(ticketIdStr),
						eventTickets: event.tickets.map((t: any) => ({
							id: t._id?.toString(),
							idRaw: t._id,
							name: t.name,
							price: t.price,
							hasStripeProductId: !!t.stripeProductId,
							stripeProductId: t.stripeProductId,
							disabled: t.disabled,
						})),
						eventId: event._id.toString(),
						eventName: event.name,
					})
					continue // Skip this ticket and continue with others
				}
			
				if (!eventTicket.stripeProductId) {
					console.error("[bookings/create-payment-link] Stripe product ID missing for ticket:", {
						bookingTicketId: ticketIdStr,
						eventTicketId: eventTicket._id?.toString(),
						eventTicketName: eventTicket.name,
						eventTicketPrice: eventTicket.price,
						eventTicketDisabled: eventTicket.disabled,
					})
					throw new Error(`Stripe product ID not found for ticket "${eventTicket.name}". Please ensure the ticket has a valid price set. You may need to update the ticket price in the event settings.`)
				}
				
				lineItems.push({
					price: eventTicket.stripeProductId,
					quantity: ticket.quantity,
				})
			} catch (ticketError: any) {
				// Log but continue - we'll check if we have any valid tickets at the end
				console.error("[bookings/create-payment-link] Error processing ticket:", ticketError)
				missingTickets.push(ticket.ticketId?.toString() || String(ticket.ticketId))
			}
		}

		// If we have missing tickets, try to recover from original Stripe session
		if (missingTickets.length > 0 && booking.stripeSessionId) {
			console.log("[bookings/create-payment-link] Tickets missing, trying to recover from original Stripe session:", booking.stripeSessionId)
			try {
				// Retrieve the original Stripe session to get line items
				const originalSession = await stripe.checkout.sessions.retrieve(booking.stripeSessionId, {
					expand: ['line_items']
				})
				
				// Handle both paginated and non-paginated line_items
				const lineItemsData = originalSession.line_items?.data || (originalSession.line_items as any)
				const itemsArray = Array.isArray(lineItemsData) ? lineItemsData : []
				
				if (itemsArray.length > 0) {
					// Extract price IDs from original session - use them directly
					const recoveredLineItems: Array<{ price: string; quantity: number }> = []
					
					for (const lineItem of itemsArray) {
						if (lineItem.price?.id) {
							recoveredLineItems.push({
								price: lineItem.price.id,
								quantity: lineItem.quantity || 1
							})
						}
					}
					
					if (recoveredLineItems.length > 0) {
						console.log("[bookings/create-payment-link] Successfully recovered line items from original session:", recoveredLineItems.length, "items")
						// Clear existing lineItems and use recovered ones
						lineItems.length = 0
						lineItems.push(...recoveredLineItems)
						// Clear missingTickets since we recovered
						missingTickets.length = 0
					} else {
						throw new Error("Could not extract price IDs from original session")
					}
				} else {
					throw new Error("Original session has no line items")
				}
			} catch (recoveryError: any) {
				console.error("[bookings/create-payment-link] Failed to recover from original session:", recoveryError)
				// Fall through to error message
				const missingTicketsList = missingTickets.join(', ')
				return sendResponse(
					res,
					null,
					`Cannot create payment link: The ticket(s) referenced in this booking (ID(s): ${missingTicketsList}) no longer exist in the event. This usually happens when tickets were deleted after the booking was created. Please cancel this booking and ask the customer to create a new booking, or contact support for assistance.`,
					false,
					ResCode.BAD_REQUEST
				)
			}
		} else if (missingTickets.length > 0) {
			// No original session to recover from
			const missingTicketsList = missingTickets.join(', ')
			return sendResponse(
				res,
				null,
				`Cannot create payment link: The ticket(s) referenced in this booking (ID(s): ${missingTicketsList}) no longer exist in the event. This usually happens when tickets were deleted after the booking was created. Please cancel this booking and ask the customer to create a new booking, or contact support for assistance.`,
				false,
				ResCode.BAD_REQUEST
			)
		}

		if (lineItems.length === 0) {
			return sendResponse(
				res,
				null,
				"Cannot create payment link: No valid tickets found for this booking. The tickets may have been deleted or the event may have been modified.",
				false,
				ResCode.BAD_REQUEST
			)
		}

		// Create Stripe checkout session
		// Set expiration to slightly less than 24 hours (23 hours 59 minutes = 86340 seconds) - Stripe requires less than 24 hours
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: lineItems,
			mode: 'payment',
			success_url: `${cleanBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}&event=${encodeURIComponent(JSON.stringify({ name: event.name, slug: event.slug }))}`,
			cancel_url: `${cleanBaseUrl}/cancel?returnUrl=${encodeURIComponent(`${cleanBaseUrl}/${event.slug}`)}`,
			client_reference_id: booking.bookingRef.replace(/^JZ-/, ""),
			customer_email: booking.customerEmail,
			expires_at: Math.floor(Date.now() / 1000) + (23 * 60 * 60) + (59 * 60), // 23 hours 59 minutes (slightly less than 24 hours)
			metadata: {
				eventId: booking.eventId.toString(),
				firstName: booking.customerName.split(' ')[0] || booking.customerName,
				lastName: booking.customerName.split(' ').slice(1).join(' ') || '',
				email: booking.customerEmail,
				phone: booking.customerPhone,
				tickets: JSON.stringify(booking.tickets.map(t => ({
					ticketId: t.ticketId.toString(),
					quantity: t.quantity,
				}))),
				bookingId: booking._id.toString(),
			},
		})
		
		console.log("[bookings/create-payment-link] Created Stripe session:", {
			id: session.id,
			url: session.url,
			expires_at: session.expires_at,
			expires_at_date: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
		})

		// Update booking with new Stripe session ID
		booking.stripeSessionId = session.id
		await booking.save()

		if (!session.url) {
			return sendResponse(res, null, "Payment session created but URL is missing", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// Send email if requested
		let emailSent = false
		if (sendEmail === true) {
			try {
				// Get ticket details for email
				const ticketDetails = booking.tickets.map((bookingTicket) => {
					const eventTicket = event.tickets.find((t: any) => {
						if (!t || !t._id) return false
						
						// Try ObjectId.equals() first (most reliable for ObjectId comparison)
						if (bookingTicket.ticketId instanceof mongoose.Types.ObjectId && t._id instanceof mongoose.Types.ObjectId) {
							if (t._id.equals(bookingTicket.ticketId)) {
								return true
							}
						}
						
						// Fallback to string comparison with normalization
						const ticketIdStr = bookingTicket.ticketId?.toString?.() || String(bookingTicket.ticketId)
						const eventTicketIdStr = t._id?.toString?.() || String(t._id)
						return eventTicketIdStr.trim() === ticketIdStr.trim()
					})
					
					return {
						name: eventTicket?.name || "Unknown Ticket",
						quantity: bookingTicket.quantity,
						price: typeof eventTicket?.price === "number" ? eventTicket.price : parseFloat(String(eventTicket?.price || "0")),
					}
				})

				const { sendPaymentLinkEmail } = await import("@/lib/send-grid")
				const customerNameParts = booking.customerName.split(' ')
				const firstName = customerNameParts[0] || booking.customerName
				const lastName = customerNameParts.slice(1).join(' ') || ''

				await sendPaymentLinkEmail({
					firstName,
					lastName,
					email: booking.customerEmail,
					eventName: event.name,
					bookingRef: booking.bookingRef,
					tickets: ticketDetails,
					paymentUrl: session.url || '',
					totalAmount: booking.total || 0,
				})
				emailSent = true
				console.log("[bookings/create-payment-link] Payment link email sent successfully to:", booking.customerEmail)
			} catch (emailError: any) {
				console.error("[bookings/create-payment-link] Failed to send payment link email:", emailError)
				// Don't fail the request if email fails - payment link was still created
			}
		}

		return sendResponse(
			res,
			{ 
				paymentUrl: session.url,
				sessionId: session.id,
				emailSent,
			},
			emailSent 
				? "New payment link created and email sent successfully" 
				: "New payment link created successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[bookings/create-payment-link] Error creating payment link:", {
			message: error.message,
			stack: error.stack,
			bookingId: req.body?.bookingId,
			errorType: error.constructor?.name,
			stripeError: error.type || error.code || error.statusCode,
		})
		return sendResponse(
			res,
			null,
			error.message || "Failed to create payment link",
			false,
			ResCode.INTERNAL_SERVER_ERROR
		)
	}
}

