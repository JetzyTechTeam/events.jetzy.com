import { createUserAction } from "@/actions/create-user-action"
import { sendResponse } from "@/lib/helpers"
import { uniqueId } from "@/lib/utils"
import { NextApiRequest } from "next"
import { NextApiResponse } from "next"

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, 405)
	}

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

		// return sendResponse(res, { sessionId: session.id }, "Checkout session created successfully", true)
	} catch (error) {
		console.error("Error:", error)
		return sendResponse(res, null, "An unknown error occurred", false, 500)
	}
}
