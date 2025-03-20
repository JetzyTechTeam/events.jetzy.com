import { createUserAction } from "@Jetzy/actions/create-user-action"
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
}
// initialize stripe
const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		// Get request params
		const tickets = JSON.parse(req.body?.tickets) as BodyParams["tickets"]
		const user = JSON.parse(req.body?.user) as BodyParams["user"]

		// create jetzy user
		try {
			await createUserAction({
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
				role: "user",
			})
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
			console.error("Error:", errorMessage)
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
		// create a checkout session
		const session = await stripe.checkout.sessions.create({
			client_reference_id: reference,
			payment_method_types: ["card"],
			line_items: prices,
			mode: "payment",
			success_url: `${process.env.NEXT_PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}&payload=${req?.body?.tickets}`,
			cancel_url: `${process.env.NEXT_PUBLIC_URL}/cancel`,
			metadata: {
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
				tickets: req.body.tickets,
				eventId: tickets[0].eventId,
			},
			customer_email: user.email,
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
