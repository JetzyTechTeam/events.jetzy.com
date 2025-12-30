import { Events } from "@/models/events"
import { createUserAction } from "@Jetzy/actions/create-user-action"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { uniqueId } from "@Jetzy/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"
import bcrypt from "bcrypt"
import { Users } from "@/models/userModal"

type BodyParams = {
	tickets: Array<{
		id: string
		name: string
		price: number
		quantity: number
		isSelected: boolean
		desc: string
		eventId: string
		priceId: string
	}>
	user: {
		firstName: string
		lastName: string
		email: string
		phone: string
		password?: string
		guestEmails?: string[]
	}
	referralCode?: string
}
// initialize stripe
if (!process.env.NEXT_STRIPE_SECRET_KEY) {
	throw new Error("NEXT_STRIPE_SECRET_KEY environment variable is required")
}
const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		// Validate request method
		if (req.method !== 'POST') {
			return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
		}

		// Validate required environment variables
		if (!process.env.NEXT_PUBLIC_URL) {
			return sendResponse(res, null, "NEXT_PUBLIC_URL environment variable is required", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// Get request params
		if (!req.body?.tickets || !req.body?.user) {
			console.error("[checkout/index] Missing parameters:", { hasTickets: !!req.body?.tickets, hasUser: !!req.body?.user, bodyKeys: Object.keys(req.body || {}) })
			return sendResponse(res, null, "Missing required parameters: tickets and user", false, ResCode.BAD_REQUEST)
		}

		let tickets: BodyParams["tickets"]
		let user: BodyParams["user"]
		let referralCode: string | undefined = undefined
		let guestEmails: string[] = []
		
		try {
			// Handle both string and object formats
			tickets = typeof req.body.tickets === 'string' 
				? JSON.parse(req.body.tickets) 
				: req.body.tickets as BodyParams["tickets"]
			user = typeof req.body.user === 'string'
				? JSON.parse(req.body.user)
				: req.body.user as BodyParams["user"]
			
			// Extract referral code if provided
			// Store original case for tracking codes, but we'll check uppercase for discount codes
			if (req.body.referralCode && typeof req.body.referralCode === 'string') {
				referralCode = req.body.referralCode.trim()
			} else if (req.body.referralCode) {
				referralCode = req.body.referralCode as string
			}
			
			// Extract guest emails if provided
			if (user.guestEmails && Array.isArray(user.guestEmails)) {
				guestEmails = user.guestEmails.filter((email: string) => email && email.trim() !== "")
			}
		} catch (parseError: any) {
			console.error("[checkout/index] JSON parse error:", parseError)
			return sendResponse(res, null, `Invalid data format: ${parseError.message}`, false, ResCode.BAD_REQUEST)
		}

		// Validate tickets array
		if (!Array.isArray(tickets) || tickets.length === 0) {
			console.error("[checkout/index] Invalid tickets:", tickets)
			return sendResponse(res, null, "Invalid tickets data", false, ResCode.BAD_REQUEST)
		}

		// Validate that all tickets have priceId
		const ticketsWithoutPriceId = tickets.filter(ticket => !ticket.priceId)
		if (ticketsWithoutPriceId.length > 0) {
			console.error("[checkout/index] Tickets missing priceId:", ticketsWithoutPriceId)
			return sendResponse(res, null, "Some tickets are missing price information. Please refresh and try again.", false, ResCode.BAD_REQUEST)
		}

		// Validate user data
		if (!user.email || !user.firstName || !user.lastName) {
			console.error("[checkout/index] Invalid user data:", user)
			return sendResponse(res, null, "Invalid user data", false, ResCode.BAD_REQUEST)
		}

		// create jetzy user
		try {
			// If password is provided, create/update user with password using Users model
			if (user.password && user.password.trim() !== "") {
				const hashedPassword = await bcrypt.hash(user.password, 10)
				const existingUser = await Users.findOne({ email: user.email.toLowerCase() })
				
				if (existingUser) {
					// If user exists but has no password, update it
					if (!existingUser.password || existingUser.password === "") {
						existingUser.password = hashedPassword
						await existingUser.save({ validateModifiedOnly: true })
					}
				} else {
					// Create new user with password
					try {
						await Users.create({
							firstName: user.firstName,
							lastName: user.lastName,
							email: user.email.toLowerCase(),
							phone: user.phone,
							password: hashedPassword,
							role: "user",
						})
					} catch (createError: any) {
						// If user already exists (race condition), try to update password
						if (createError.code === 11000 || createError.message?.includes("duplicate")) {
							const userToUpdate = await Users.findOne({ email: user.email.toLowerCase() })
							if (userToUpdate && (!userToUpdate.password || userToUpdate.password === "")) {
								userToUpdate.password = hashedPassword
								await userToUpdate.save({ validateModifiedOnly: true })
							}
						} else {
							throw createError
						}
					}
				}
			}
			
			// Always call createUserAction to ensure user settings are created/updated
			await createUserAction({
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
				role: "user",
			})
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
			console.error("Error creating user:", errorMessage)
			// Don't fail the checkout if user creation fails - user might already exist
		}

		// Validate and get referral code if provided
		// Note: referralCode can be either a discount code (in ReferralCodes collection) or a tracking code (from URL)
		let referralCodeData: { code: string; discountPercentage: number } | null = null
		let trackingReferralCode: string | undefined = undefined // Store tracking code even if not a discount code
		
		if (referralCode) {
			try {
				const { ReferralCodes } = await import("@/models/events/referral-codes")
				const { Types } = await import("mongoose")
				
				// Check both uppercase and original case for referral code
				const codeRecord = await ReferralCodes.findOne({
					eventId: new Types.ObjectId(tickets[0]?.eventId),
					$or: [
						{ code: referralCode.toUpperCase() },
						{ code: referralCode }
					],
					isDeleted: false,
					isActive: true,
				})

				if (codeRecord) {
					// Valid discount code found
					// Check if code has reached max uses
					if (codeRecord.maxUses !== null && codeRecord.maxUses !== undefined && codeRecord.usageCount >= codeRecord.maxUses) {
						return sendResponse(res, null, "Referral code has reached maximum uses", false, ResCode.BAD_REQUEST)
					}

					referralCodeData = {
						code: codeRecord.code,
						discountPercentage: codeRecord.discountPercentage,
					}
					trackingReferralCode = codeRecord.code // Use the validated code
				} else {
					// Not a valid discount code, but store it as a tracking code
					// This allows tracking codes like "join-from-this" to be stored for analytics
					// Preserve original case (usually lowercase from URL)
					trackingReferralCode = referralCode.trim().toLowerCase()
					console.log("[checkout/index] Referral code not found in database, storing as tracking code:", trackingReferralCode)
				}
			} catch (referralError: any) {
				console.error("[checkout/index] Error validating referral code:", referralError)
				// Don't fail checkout if referral code validation fails - just store it as tracking code
				trackingReferralCode = referralCode.trim().toLowerCase()
			}
		}

		// using price api from stripe create price for the tickets selected
		// Filter out tickets that aren't selected, have quantity 0, or don't have priceId
		const prices = tickets
			.filter((ticket) => ticket.isSelected && ticket.quantity > 0 && ticket.priceId)
			.map((ticket) => {
				return {
					price: ticket.priceId,
					quantity: ticket.quantity,
				}
			})

		if (prices.length === 0) {
			console.error("[checkout/index] No valid prices found after filtering")
			return sendResponse(res, null, "No valid ticket prices found. Please refresh and try again.", false, ResCode.BAD_REQUEST)
		}

		// generate a reference id
		const reference = uniqueId(20)

		const event = await Events.findOne({
			_id: tickets[0]?.eventId,
			isDeleted: false,
		})

		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Auto-disable tickets that have exceeded due date or quantity limit
		const now = new Date()
		let ticketsUpdated = false
		const updatedTickets = event.tickets?.map((ticket: any) => {
			let shouldDisable = ticket.disabled || false
			
			// Check if due date has passed
			if (ticket.dueDate) {
				const dueDate = new Date(ticket.dueDate)
				if (dueDate < now && !ticket.disabled) {
					shouldDisable = true
					ticketsUpdated = true
				}
			}
			
			// Check if quantity limit has been reached
			if (ticket.quantityLimit && ticket.quantitySold !== undefined) {
				if (ticket.quantitySold >= ticket.quantityLimit && !ticket.disabled) {
					shouldDisable = true
					ticketsUpdated = true
				}
			}
			
			return {
				...ticket.toObject(),
				disabled: shouldDisable,
			}
		}) || event.tickets

		// Update event if any tickets were auto-disabled
		if (ticketsUpdated && updatedTickets) {
			await Events.updateOne(
				{ _id: event._id },
				{ $set: { tickets: updatedTickets } }
			)
			// Update the event object for use below
			event.tickets = updatedTickets
		}

		// Validate that selected tickets are not disabled
		const selectedTicketIds = tickets
			.filter(ticket => ticket.isSelected && ticket.quantity > 0)
			.map(ticket => ticket.id)
		
		const disabledTickets = event.tickets?.filter((ticket: any) => {
			const ticketId = ticket._id?.toString()
			return ticket.disabled && selectedTicketIds.includes(ticketId)
		}) || []
		
		if (disabledTickets.length > 0) {
			const disabledTicketNames = disabledTickets.map((t: any) => t.name).join(", ")
			return sendResponse(res, null, `The following ticket(s) are no longer available: ${disabledTicketNames}. Please refresh the page and select different tickets.`, false, ResCode.BAD_REQUEST)
		}

		// Validate event has a slug
		if (!event.slug) {
			console.error("[checkout/index] Event missing slug:", event._id, event.name)
			return sendResponse(res, null, "Event configuration error: missing slug", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// Import required modules
		const { Bookings } = await import("@/models/events/bookings")
		const { BookingStatus } = await import("@/models/events/types")
		const { Types } = await import("mongoose")
		
		// Ensure eventId is an ObjectId
		const eventObjectId = new Types.ObjectId(event._id.toString())
		
		// Check if event has capacity limit
		if (event.capacity > 0) {
			// Get current booked tickets from event tracker
			const { EventTracker } = await import("@/models/events/event-tracker")
			let eventTracker = await EventTracker.findOne({ eventId: event._id })
			
			// If EventTracker doesn't exist, create it with the current event capacity
			if (!eventTracker) {
				console.log("[checkout/index] EventTracker not found, creating one with capacity:", event.capacity)
				eventTracker = await EventTracker.create({
					eventId: event._id,
					eventCapacity: event.capacity,
					bookedTickets: 0,
				})
			}
			
			// Count CONFIRMED, APPROVED, PENDING, and CHECKED_IN bookings toward capacity
			// PENDING bookings are reserved spots (especially from waiting list approvals)
			// CHECKED_IN bookings still count toward capacity (they're confirmed bookings that have been checked in)
			const activeBookings = await Bookings.find({
				eventId: eventObjectId,
				status: { $in: [BookingStatus.CONFIRMED, BookingStatus.APPROVED, BookingStatus.PENDING, BookingStatus.CHECKED_IN] },
				isDeleted: false,
			})
			
			// Also get all bookings for debugging
			const allBookings = await Bookings.find({
				eventId: eventObjectId,
				isDeleted: false,
			})
			
			const actualBookedTickets = activeBookings.reduce((sum, booking) => {
				return sum + booking.tickets.reduce((ticketSum, ticket) => ticketSum + ticket.quantity, 0)
			}, 0)
			
			console.log("[checkout/index] Capacity check:", {
				eventId: event._id.toString(),
				eventCapacity: event.capacity,
				actualBookedTickets,
				activeBookingsCount: activeBookings.length,
				allBookingsCount: allBookings.length,
				bookingsByStatus: allBookings.reduce((acc, b) => {
					acc[b.status] = (acc[b.status] || 0) + 1
					return acc
				}, {} as Record<string, number>),
			})
			
			// Filter out tickets that aren't selected or have quantity 0
			const selectedTickets = tickets.filter(ticket => ticket.isSelected && ticket.quantity > 0)
			const totalTicketsRequested = selectedTickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
			// Use event.capacity as source of truth (in case EventTracker.eventCapacity is stale)
			const availableCapacity = event.capacity - actualBookedTickets
			
			console.log("[checkout/index] Capacity calculation:", {
				eventCapacity: event.capacity,
				actualBookedTickets,
				availableCapacity,
				totalTicketsRequested,
				hasEnoughCapacity: availableCapacity >= totalTicketsRequested,
				willShowWaitingList: availableCapacity < totalTicketsRequested,
			})

			// Show waiting list if:
			// 1. Available capacity is 0 or less (event is at or over capacity)
			// 2. OR available capacity is less than requested tickets (would exceed capacity)
			const isAtOrOverCapacity = availableCapacity <= 0
			const wouldExceedCapacity = availableCapacity < totalTicketsRequested
			
			if (isAtOrOverCapacity || wouldExceedCapacity) {
				// Event is at capacity or would be exceeded
				// No restrictions - allow user to join waiting list regardless of existing bookings
				
				// Check if user is already on waiting list
				const { WaitingList } = await import("@/models/waitingList")
				const existingWaitingListEntry = await WaitingList.findOne({
					eventId: event._id,
					email: user.email.toLowerCase(),
					status: 'waiting'
				})

				if (existingWaitingListEntry) {
					return sendResponse(res, {
						alreadyOnWaitingList: true,
						eventName: event.name,
						eventId: event._id,
					}, "You are already on the waiting list for this event.", true, ResCode.OK)
				}

				// Event is at capacity, return waiting list option
				return sendResponse(res, {
					atCapacity: true,
					availableCapacity,
					requestedTickets: totalTicketsRequested,
					eventName: event.name,
					eventId: event._id,
				}, "Event capacity reached. Would you like to join the waiting list?", true, ResCode.OK)
			}
		}

		const eventDetails = { 
			name: event?.name,
			location: event?.location,
			startsOn: event?.startsOn,
			timezone: event?.timezone,
			slug: event?.slug,
		}

		// Use NEXT_PUBLIC_URL for redirect URLs
		// TODO: Change back to environment variable after testing
		// const baseUrl = process.env.NEXT_PUBLIC_URL
		// if (!baseUrl) {
		// 	return sendResponse(res, null, "NEXT_PUBLIC_URL environment variable is required", false, ResCode.INTERNAL_SERVER_ERROR)
		// }
		
		// Get base URL dynamically from request headers (no hardcoded URLs)
		let baseUrl: string | null = null
		
		// Always use request origin if available (works for both localhost and production)
		if (req.headers.host) {
			// Determine protocol from headers (respects proxies and SSL)
			const protocol = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim() || 
				(req.headers['x-forwarded-ssl'] === 'on' ? 'https' : null) ||
				(req.headers.host.includes('localhost') || req.headers.host.includes('127.0.0.1') ? 'http' : 'https')
			
			baseUrl = `${protocol}://${req.headers.host}`
			console.log("[checkout/index] Using request origin as base URL:", baseUrl)
		} else {
			// Fallback to environment variable only if request headers don't have host
			baseUrl = process.env.NEXT_PUBLIC_URL || null
			if (baseUrl) {
				console.log("[checkout/index] Using NEXT_PUBLIC_URL as base URL:", baseUrl)
			}
		}
		
		if (!baseUrl) {
			return sendResponse(res, null, "Cannot determine base URL from request headers or environment", false, ResCode.INTERNAL_SERVER_ERROR)
		}
		
		// Ensure URL is properly formatted
		const cleanBaseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
		const successUrl = `${cleanBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}`
		
		// Get the return URL from request (the event page URL)
		// This will be passed as a query parameter so it persists even if sessionStorage is lost
		// Priority 1: Use referer if available (most reliable - works for any environment)
		let eventPageUrl: string | null = null
		
		if (req.headers.referer) {
			try {
				const refererUrl = new URL(req.headers.referer)
				const baseUrlObj = new URL(cleanBaseUrl)
				
				// Only use if it's from the same origin and not the base URL
				if (refererUrl.origin === baseUrlObj.origin && 
					refererUrl.pathname !== '/' && 
					refererUrl.pathname !== '' &&
					!refererUrl.pathname.includes('/cancel') &&
					!refererUrl.pathname.includes('/success')) {
					eventPageUrl = refererUrl.href
					console.log("[checkout/index] Using referer URL:", eventPageUrl)
				} else {
					console.log("[checkout/index] Referer URL rejected - origin:", refererUrl.origin, "base origin:", baseUrlObj.origin, "pathname:", refererUrl.pathname)
				}
			} catch (e) {
				// Invalid referer, use default
				console.error("[checkout/index] Error parsing referer:", e)
			}
		}
		
		// Priority 2: Construct from event slug if referer not available
		if (!eventPageUrl && eventDetails && eventDetails.slug) {
			eventPageUrl = `${cleanBaseUrl}/${eventDetails.slug}`
			console.log("[checkout/index] Constructed event page URL from slug:", eventPageUrl)
		}
		
		// If we still don't have a valid URL, log error
		if (!eventPageUrl || eventPageUrl === cleanBaseUrl || eventPageUrl === `${cleanBaseUrl}/`) {
			console.error("[checkout/index] WARNING: Could not construct valid event page URL. Event slug:", eventDetails?.slug, "Referer:", req.headers.referer, "Base URL:", cleanBaseUrl)
			// Don't use base URL - it will redirect to home page
			// Instead, try to construct from slug even if we already tried
			if (eventDetails && eventDetails.slug) {
				eventPageUrl = `${cleanBaseUrl}/${eventDetails.slug}`
				console.log("[checkout/index] Forced construction from slug:", eventPageUrl)
			} else {
				console.error("[checkout/index] Cannot construct return URL - event slug missing")
				// This is a critical error - we can't proceed without a valid return URL
				return sendResponse(res, null, "Cannot determine return URL. Event configuration error.", false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}
		
		const encodedReturnUrl = encodeURIComponent(eventPageUrl)
		const cancelUrl = `${cleanBaseUrl}/cancel?returnUrl=${encodedReturnUrl}`
		
		console.log("[checkout/index] Success URL:", successUrl)
		console.log("[checkout/index] Cancel URL:", cancelUrl)

		// Validate URLs
		try {
			new URL(successUrl.replace('{CHECKOUT_SESSION_ID}', 'test'))
			new URL(cancelUrl)
		} catch (urlError: any) {
			console.error("Invalid URL format:", urlError)
			throw new Error(`Invalid URL format: ${urlError.message || urlError}`)
		}

		// Prepare metadata object
		const metadata: Record<string, string> = {
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			phone: user.phone,
			tickets: req.body.tickets,
			eventId: tickets[0]?.eventId || "",
			eventDetails: JSON.stringify(eventDetails),
		}
		
		// Add guest emails to metadata if available
		if (guestEmails.length > 0) {
			metadata.guestEmails = JSON.stringify(guestEmails)
		}

		// Add referral code to metadata if available (either discount code or tracking code)
		if (referralCodeData) {
			// Valid discount code
			metadata.referralCode = referralCodeData.code
			metadata.discountPercentage = referralCodeData.discountPercentage.toString()
		} else if (trackingReferralCode) {
			// Tracking code (not a discount code, but still track it for analytics)
			metadata.referralCode = trackingReferralCode
		}

		// Create Stripe coupon for referral code discount if applicable
		let discountConfig: Stripe.Checkout.SessionCreateParams.Discount[] | undefined = undefined
		if (referralCodeData) {
			try {
				// Create a coupon for this discount (reusable or one-time)
				const coupon = await stripe.coupons.create({
					percent_off: referralCodeData.discountPercentage,
					duration: 'once',
					name: `Referral: ${referralCodeData.code}`,
				})

				discountConfig = [{
					coupon: coupon.id,
				}]
			} catch (couponError: any) {
				console.error("[checkout/index] Error creating Stripe coupon:", couponError)
				// Continue without discount if coupon creation fails
			}
		}

		// create a checkout session
		const sessionParams: Stripe.Checkout.SessionCreateParams = {
			client_reference_id: reference,
			payment_method_types: ["card"],
			line_items: prices,
			mode: "payment",
			success_url: successUrl,
			cancel_url: cancelUrl,
			// Removed locale parameter - Stripe will auto-detect based on user's browser settings
			metadata,
			customer_email: user.email,
		}

		// Add discounts if referral code is valid
		if (discountConfig) {
			sessionParams.discounts = discountConfig
		}

		const session = await stripe.checkout.sessions.create(sessionParams).catch((stripeError) => {
			console.error("[checkout/index] Stripe session creation failed:", stripeError)
			throw new Error(`Stripe error: ${stripeError.message}`)
		})

		if (session) {
			// Log session details for debugging
			console.log("[checkout/index] Stripe session created:", {
				id: session.id,
				hasUrl: !!session.url,
				url: session.url,
				paymentStatus: session.payment_status,
				mode: session.mode
			})
			
			// Verify session has URL (should always be present for checkout sessions)
			if (!session.url) {
				console.error("[checkout/index] Stripe session created but URL is missing:", session)
				return sendResponse(res, null, "Checkout session created but payment URL is missing. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
			}
			
			return sendResponse(res, session, "Checkout created successfully!", true, ResCode.OK)
		}

		return sendResponse(res, null, "Couldn't complete checkout.", false, ResCode.BAD_REQUEST)
	} catch (error: any) {
		console.error("[checkout/index] Error details:", {
			message: error.message,
			stack: error.stack,
			name: error.name,
			code: error.code,
		})
		console.log("[checkout/index] Error:", error.message)
		return sendResponse(res, null, error.message || "An error occurred during checkout", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
