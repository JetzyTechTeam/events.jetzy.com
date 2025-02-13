// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { generateRandomId, sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Transactions } from "@Jetzy/models/transactionModel"
import Stripe from "stripe"
import { Tickets } from "@Jetzy/models/eventTicketsModel"

// initialize stripe
const stripe = new Stripe(process.env.NEXT_PUBLIC_STRIPE_SEC_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)
	// Get request params
	const { firstName, lastName, email, phone, event, quantity } = req?.body

	try {
		// make sure user email is not already registered for this event
		if (await Tickets.findOne({ email, event }).exec()) return sendResponse(res, null, "You have already registered for this event.", false, ResCode.BAD_REQUEST)

		// make sure user is logged-in before creating events
		if (!session) return sendResponse(res, null, "You need to be logged in to perform this action.", false, ResCode.UNAUTHORIZED)

		// Get the event
		const _event = await Events.findById(event).exec()
		// Check if event exists
		if (!_event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)

		const _ticketId = generateRandomId(10, false)

		// Create the ticket
		const newTicket = await Tickets.create({
			ticketId: _ticketId,
			firstName,
			lastName,
			email,
			phone,
			event,
			quantity,
		})

		// multiply the amount by the quantity
		const subtotal = _event?.amount * quantity

		// Create a payment intent
		const piParams: Stripe.PaymentIntentCreateParams = {
			amount: subtotal * 100,
			currency: "usd",
			automatic_payment_methods: {
				enabled: true,
			},
			description: `Ticket for ${_event?.title}`,
			metadata: {
				ticketId: newTicket.ticketId,
			},
		}

		// Create the payment intent
		const paymentIntent: Stripe.PaymentIntent = await stripe.paymentIntents.create(piParams)

		// create a transaction with piSecret
		const newTransaction = await Transactions.create({
			reference: paymentIntent.id,
			amount: paymentIntent.amount,
			event,
			ticket: newTicket._id,
			piSecret: paymentIntent.client_secret,
		})

		// client response
		const clientResponse = {
			ticket: newTicket,
			transaction: newTransaction,
			configs: {
				stripe: {
					publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUB_KEY,
					piSecret: paymentIntent.client_secret,
				},
			},
		}

		return sendResponse(res, clientResponse, "Ticket created successfully!", true, ResCode.CREATED)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
