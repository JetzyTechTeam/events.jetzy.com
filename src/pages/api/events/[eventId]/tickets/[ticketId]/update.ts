import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import zod from "zod"

const schema = zod.object({
	title: zod.string().nonempty(),
	description: zod.string().optional(),
	price: zod.number().nonnegative().optional(),
	dueDate: zod.string().optional(),
	quantityLimit: zod.number().positive().optional(),
})

import Stripe from "stripe"
const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)

	try {
		// make sure user is logged-in
		if (!session) return sendResponse(res, null, "You need to be logged in to update a ticket.", false, ResCode.UNAUTHORIZED)

		// Validate the request body
		const data = schema.safeParse(req.body)
		if (!data.success) return sendResponse(res, data.error.errors, "Invalid request body", false, ResCode.BAD_REQUEST)

		// Get the IDs from query
		const { eventId, ticketId } = req.query

		const updateData: any = {
			"tickets.$.name": data.data.title,
			"tickets.$.desc": data.data.description || "",
			"tickets.$.dueDate": data.data.dueDate || undefined,
			"tickets.$.quantityLimit": data.data.quantityLimit || undefined,
		}

		if (data.data.price !== undefined) {
			updateData["tickets.$.price"] = data.data.price.toFixed(2)

			// Create a new Stripe price
			const stripePrice = await stripe.prices.create({
				unit_amount: Math.round(data.data.price * 100),
				currency: "usd",
				product_data: {
					name: data.data.title,
				},
			})
			updateData["tickets.$.stripeProductId"] = stripePrice.id
		}

		// Update the ticket
		const result = await Events.updateOne(
			{ _id: eventId, "tickets._id": ticketId },
			{ $set: updateData }
		)

		if (result.matchedCount === 0) return sendResponse(res, null, "Ticket not found", false, ResCode.NOT_FOUND)

		return sendResponse(res, null, "Ticket updated successfully", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
