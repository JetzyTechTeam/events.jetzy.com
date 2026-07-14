import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { uniqueId } from "@Jetzy/lib/utils"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

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
	}
	referralCode?: string
	customAnswers?: any[]
}

let stripeInstance: Stripe | null = null

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	console.log("[checkout/index] Request received:", { method: req.method, bodyKeys: Object.keys(req.body || {}) })

	try {
		// Check for missing env vars early
		const missingVars = [];
		if (!process.env.NEXT_EVENTS_DB_URL) missingVars.push("NEXT_EVENTS_DB_URL");
		if (!process.env.NEXT_STRIPE_SECRET_KEY) missingVars.push("NEXT_STRIPE_SECRET_KEY");
		if (!process.env.NEXT_PUBLIC_URL) missingVars.push("NEXT_PUBLIC_URL");

		if (missingVars.length > 0) {
			console.error("[checkout/index] CRITICAL: Missing environment variables:", missingVars.join(", "));
			return res.status(500).json({
				error: {
					code: "500",
					message: `Missing environment variables: ${missingVars.join(", ")}. Please check your production environment configuration.`
				}
			});
		}

		// initialize stripe
		if (!stripeInstance) {
			stripeInstance = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)
		}
		const stripe = stripeInstance

		// Ensure database connection
		const { ensureDbConnected } = await import("@/configs/database")
		await ensureDbConnected()

		// Dynamically import models to ensure they use the connected db
		const { Events } = await import("@/models/events")
		const { createOrUpdateUser } = await import("@Jetzy/lib/user-utils")

		// Validate request method
		if (req.method !== 'POST') {
			console.warn("[checkout/index] Method not allowed:", req.method)
			return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
		}

		// Get request params
		if (!req.body?.tickets || !req.body?.user) {
			console.warn("[checkout/index] Missing parameters")
			return sendResponse(res, null, "Missing required parameters: tickets and user", false, ResCode.BAD_REQUEST)
		}

		let tickets: BodyParams["tickets"]
		let user: BodyParams["user"]
		let customAnswers: any[] = []

		try {
			// Handle both stringified and object bodies
			tickets = typeof req.body.tickets === 'string' ? JSON.parse(req.body.tickets) : req.body.tickets
			user = typeof req.body.user === 'string' ? JSON.parse(req.body.user) : req.body.user
			if (req.body.customAnswers) {
				customAnswers = typeof req.body.customAnswers === 'string' ? JSON.parse(req.body.customAnswers) : req.body.customAnswers
			}
		} catch (parseError: any) {
			console.error("[checkout/index] JSON parse error:", parseError.message)
			return sendResponse(res, null, "Invalid JSON data in request body", false, ResCode.BAD_REQUEST)
		}

		const referralCode = req.body.referralCode as string | undefined
		console.log("[checkout/index] Checkout started for:", { email: user?.email, eventId: tickets?.[0]?.eventId, referralCode })

		// Validate tickets array
		if (!Array.isArray(tickets) || tickets.length === 0) {
			console.warn("[checkout/index] Invalid tickets array")
			return sendResponse(res, null, "Invalid tickets data", false, ResCode.BAD_REQUEST)
		}

		// Validate user data
		if (!user || !user.email || !user.firstName || !user.lastName) {
			console.warn("[checkout/index] Invalid user data")
			return sendResponse(res, null, "Invalid user data", false, ResCode.BAD_REQUEST)
		}

		// Require T&C consent (agreeing to register + create a Jetzy account)
		const acceptedTerms = req.body?.acceptedTerms === true || req.body?.acceptedTerms === "true"
		if (!acceptedTerms) {
			return sendResponse(res, null, "You must agree to the Terms & Conditions to register.", false, ResCode.BAD_REQUEST)
		}
		const acceptedTermsAt = new Date()

		// create jetzy user
		try {
			await createOrUpdateUser({
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
				role: "user",
				acceptedTerms: true,
				acceptedTermsAt,
			})
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
			console.error("[checkout/index] Error creating user profile:", errorMessage)
			// Non-critical error, continue
		}

		// Validate and get referral code if provided
		let referralCodeData: { code: string; discountPercentage: number } | null = null
		if (referralCode) {
			try {
				const { ReferralCodes } = await import("@/models/events/referral-codes")
				const { Types } = await import("mongoose")

				const eventIdToQuery = tickets[0]?.eventId
				if (!eventIdToQuery || !Types.ObjectId.isValid(eventIdToQuery)) {
					console.error("[checkout/index] Invalid event ID in tickets:", eventIdToQuery)
					return sendResponse(res, null, "Invalid event ID", false, ResCode.BAD_REQUEST)
				}

				const codeRecord = await ReferralCodes.findOne({
					eventId: new Types.ObjectId(eventIdToQuery),
					code: referralCode.toUpperCase(),
					isDeleted: false,
					isActive: true,
				})

				if (!codeRecord) {
					console.warn("[checkout/index] Referral code not found or inactive for this event:", referralCode)
					return sendResponse(res, null, "Invalid or inactive referral code", false, ResCode.BAD_REQUEST)
				}

				// Check if code has reached max uses
				if (codeRecord.maxUses !== null && codeRecord.maxUses !== undefined && codeRecord.usageCount >= codeRecord.maxUses) {
					console.warn("[checkout/index] Referral code max uses reached")
					return sendResponse(res, null, "Referral code has reached maximum uses", false, ResCode.BAD_REQUEST)
				}

				referralCodeData = {
					code: codeRecord.code,
					discountPercentage: codeRecord.discountPercentage,
				}
				console.log("[checkout/index] Referral code applied:", referralCodeData)
			} catch (referralError: any) {
				console.error("[checkout/index] Error validating referral code:", referralError)
				return sendResponse(res, null, "Error validating referral code", false, ResCode.INTERNAL_SERVER_ERROR)
			}
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
			console.warn("[checkout/index] Event not found:", tickets[0]?.eventId)
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Validate required custom questions
		if (event.questions && event.questions.length > 0) {
			const requiredQuestions = event.questions.filter(q => q.isRequired);
			for (const reqQ of requiredQuestions) {
				const ans = customAnswers.find(a => a.questionId === reqQ.id);
				if (!ans || !ans.answer || (Array.isArray(ans.answer) && ans.answer.length === 0)) {
					return sendResponse(res, null, `Required question "${reqQ.title}" is missing an answer.`, false, ResCode.BAD_REQUEST);
				}
			}
		}

		// capacity 0 = unlimited (per schema). Only enforce when capacity > 0.
		if (event.capacity > 0) {
			const { EventTracker } = await import("@/models/events/event-tracker")
			const eventTracker = await EventTracker.findOne({ eventId: event._id })

			if (eventTracker) {
				const totalTicketsRequested = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0)
				const availableCapacity = event.capacity - eventTracker.bookedTickets

				if (availableCapacity < totalTicketsRequested) {
					console.info("[checkout/index] Event at capacity")
					return sendResponse(res, {
						atCapacity: true,
						availableCapacity,
						requestedTickets: totalTicketsRequested,
						eventName: event.name,
						eventId: event._id,
						isClosed: false,
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

		const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
		const cleanBaseUrl = baseUrl.replace(/\/$/, '')
		const successUrl = `${cleanBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}`
		const cancelUrl = `${cleanBaseUrl}/cancel`

		// Create Stripe coupon for referral code discount if applicable
		let discountConfig: Stripe.Checkout.SessionCreateParams.Discount[] | undefined = undefined
		if (referralCodeData) {
			try {
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
			}
		}

		// Prepare metadata
		const metadata: Stripe.MetadataParam = {
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			phone: user.phone,
			tickets: typeof req.body.tickets === 'string' ? req.body.tickets : JSON.stringify(tickets),
			eventId: tickets[0]?.eventId || "",
			eventDetails: JSON.stringify(eventDetails),
			acceptedTerms: "true",
			acceptedTermsAt: acceptedTermsAt.toISOString(),
		}

		if (referralCodeData) {
			metadata.referralCode = referralCodeData.code
			metadata.discountPercentage = referralCodeData.discountPercentage.toString()
		}

		if (customAnswers && customAnswers.length > 0) {
			customAnswers.forEach(ans => {
				const val = typeof ans.answer === 'string' ? ans.answer : JSON.stringify(ans.answer);
				// Truncate to 500 characters to fit Stripe metadata limits safely
				metadata[`ans_${ans.questionId}`] = val.slice(0, 500);
			});
		}

		// create a checkout session
		const session = await stripe.checkout.sessions.create({
			client_reference_id: reference,
			payment_method_types: ["card"],
			line_items: prices,
			mode: "payment",
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: metadata,
			customer_email: user.email,
			discounts: discountConfig,
		}).catch((stripeError: any) => {
			console.error("[checkout/index] Stripe session creation failed:", stripeError.message)
			throw new Error(`Stripe error: ${stripeError.message}`)
		})

		if (session) {
			console.log("[checkout/index] Checkout session created:", session.id)
			return sendResponse(res, session, "Checkout created successfully!", true, ResCode.OK)
		}

		return sendResponse(res, null, "Couldn't complete checkout.", false, ResCode.BAD_REQUEST)
	} catch (error: any) {
		console.error("[checkout/index] CRITICAL ERROR:", error.message || error)
		if (error.stack) console.error(error.stack)
		return res.status(500).json({
			error: {
				code: "500",
				message: error.message || "An unexpected server error occurred"
			}
		})
	}
}
