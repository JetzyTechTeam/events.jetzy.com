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
	}
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
			return sendResponse(res, null, "Missing required parameters: tickets and user", false, ResCode.BAD_REQUEST)
		}

		const tickets = JSON.parse(req.body?.tickets) as BodyParams["tickets"]
		const user = JSON.parse(req.body?.user) as BodyParams["user"]

		// Validate tickets array
		if (!Array.isArray(tickets) || tickets.length === 0) {
			return sendResponse(res, null, "Invalid tickets data", false, ResCode.BAD_REQUEST)
		}

		// Validate user data
		if (!user.email || !user.firstName || !user.lastName) {
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

		// using price api from stripe create price for the tickets selected
		const prices = tickets.map((ticket) => {
			return {
				price: ticket.priceId,
				quantity: ticket.quantity,
			}
		})

		// generate a reference id
		const reference = uniqueId(20)

		const event = await Events.findOne({
			_id: tickets[0]?.eventId,
			isDeleted: false,
		})

		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Check if event has capacity limit
		if (event.capacity > 0) {
			// Get current booked tickets from event tracker
			const { EventTracker } = await import("@/models/events/event-tracker")
			const eventTracker = await EventTracker.findOne({ eventId: event._id })
			
			if (eventTracker) {
				const totalTicketsRequested = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
				const availableCapacity = event.capacity - eventTracker.bookedTickets
				
				if (availableCapacity < totalTicketsRequested) {
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
		}

		const eventDetails = { 
			name: event?.name,
			location: event?.location,
			startsOn: event?.startsOn,
			timezone: event?.timezone,
			slug: event?.slug,
		}

		// Validate and log URLs
		const baseUrl = process.env.NEXT_PUBLIC_URL || "https://jetzy-events.vercel.app"
		console.log("NEXT_PUBLIC_URL:", baseUrl)
		
		// Ensure URL is properly formatted
		const cleanBaseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
		const successUrl = `${cleanBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}`
		const cancelUrl = `${cleanBaseUrl}/cancel`
		
		console.log("Success URL:", successUrl)
		console.log("Cancel URL:", cancelUrl)

		// Validate URLs
		try {
			new URL(successUrl.replace('{CHECKOUT_SESSION_ID}', 'test'))
			new URL(cancelUrl)
		} catch (urlError: any) {
			console.error("Invalid URL format:", urlError)
			throw new Error(`Invalid URL format: ${urlError.message || urlError}`)
		}

		// create a checkout session
		const session = await stripe.checkout.sessions.create({
			client_reference_id: reference,
			payment_method_types: ["card"],
			line_items: prices,
			mode: "payment",
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: {
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
				tickets: req.body.tickets,
				eventId: tickets[0]?.eventId || "",
				eventDetails: JSON.stringify(eventDetails),
			},
			customer_email: user.email,
		}).catch((stripeError) => {
			console.error("Stripe session creation failed:", stripeError)
			throw new Error(`Stripe error: ${stripeError.message}`)
		})

		if (session) {
			return sendResponse(res, session, "Checkout created successfully!", true, ResCode.OK)
		}

		return sendResponse(res, null, "Couldn't complete checkout.", false, ResCode.BAD_REQUEST)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
