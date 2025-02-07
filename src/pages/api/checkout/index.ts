import { createUserAction } from "@Jetzy/actions/create-user-action"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { uniqueId } from "@Jetzy/lib/utils"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"

type BodyParams = {
	tickets: Array<{
		id: number
		name: string
		price: number
		quantity: number
		isSelected: boolean
		desc: string
	}>
	user: {
		firstName: string
		lastName: string
		email: string
		phone: string
	}
}
// initialize stripe
const stripe = new Stripe(process.env.NEXT_PUBLIC_STRIPE_SEC_KEY as string)
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
				role: "user"
		})
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
			console.error("Error:", errorMessage)
		}

		// using price api from stripe create price for the tickets selected
		const prices = tickets.map((ticket) => {
			return {
				price_data: {
					currency: "usd",
					product_data: {
						name: ticket.name,
						description: ticket.desc,
					},
					unit_amount: ticket.price * 100,
				},
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
			success_url: `${process.env.NEXT_PUBLIC_URL}/success?payload=${req?.body?.tickets}`,
			cancel_url: `${process.env.NEXT_PUBLIC_URL}/cancel`,
			metadata: {
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
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
