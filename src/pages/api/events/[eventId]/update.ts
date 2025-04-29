// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { generateRandomId, sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { CreateEventFormData } from "@/types"
import zod from "zod"
import Stripe from "stripe"
import { formatTextWithLineBreaks } from "@/lib/utils"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"

// create validation schema

const schema = zod.object({
	eventId: zod.string().nonempty(),
	startDate: zod.string().nonempty(),
	startTime: zod.string().nonempty(),
	endDate: zod.string().nonempty(),
	endTime: zod.string().nonempty(),
	name: zod.string().nonempty(),
	location: zod.string().nonempty(),
	capacity: zod.number().nonnegative(),
	requireApproval: zod.boolean(),
	images: zod.array(
		zod.object({
			id: zod.string().optional(),
			file: zod.string().optional(),
		}),
	),
	tickets: zod.array(
		zod.object({
			id: zod.string().nonempty(),
			title: zod.string().nonempty(),
			price: zod.number().nonnegative(),
			description: zod.string().nonempty(),
		}),
	),
	isPaid: zod.boolean(),
	desc: zod.string().nonempty(),
	timezone: zod.string().nonempty()
})

// create stripe instance
const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)

	try {
		// make sure user is logged-in before creating events
		if (!session) return sendResponse(res, null, "You need to be logged in to create an event.", false, ResCode.UNAUTHORIZED)

		// get the request body
		const body = req?.body as { payload: string }
		const params: CreateEventFormData = JSON.parse(body.payload) as CreateEventFormData

		const { eventId } = req.query

		// validate the request body
		const data = schema.safeParse({ ...params, eventId })
		if (!data.success) return sendResponse(res, data.error.errors, "Your request could not be complete, please check your input and try again.", false, ResCode.BAD_REQUEST)

		// Desctructure the request body
		const { startDate, startTime, endDate, endTime, name, location, capacity, requireApproval, images, tickets, isPaid, desc, timezone } = params

		// construct datetime for start and end dates
		const start = new Date(`${startDate} ${startTime}`)
		const end = new Date(`${endDate} ${endTime}`)

		// check if start date is greater than end date
		if (start >= end) return sendResponse(res, null, "Start date must be less than end date.", false, ResCode.BAD_REQUEST)

		// check if the event has tickets
		if (isPaid && tickets.length === 0) return sendResponse(res, null, "You need to add at least one ticket to a paid event.", false, ResCode.BAD_REQUEST)

		// If event is paid and has tickets, lets format the tickets and create stripe prices for each ticket
		const formattedTickets: Stripe.PriceCreateParams[] = tickets.map((ticket) => ({
			unit_amount: ticket.price * 100,
			currency: "usd",
			product_data: {
				name: ticket.title,
			},
		}))

		// create stripe products for each ticket
		const stripeProducts = await Promise.all(formattedTickets.map((ticket) => stripe.prices.create(ticket)))
		if (!stripeProducts) return sendResponse(res, null, "Failed to create event tickets.", false, ResCode.INTERNAL_SERVER_ERROR)

		// Get the event
		const event = await Events.findOne({ _id: new Types.ObjectId(eventId as string) })
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		// Find the event by id and update it
		const newEvent = await Events.updateOne(
			{
				_id: new Types.ObjectId(eventId as string),
			},
			{
				$set: {
					slug: generateRandomId(10),
					name,
					location,
					desc: formatTextWithLineBreaks(desc),
					startsOn: start,
					endsOn: end,
					isPaid,
					capacity,
					requireApproval,
					tickets: tickets.map((ticket, index) => ({
						name: ticket.title,
						desc: ticket.description,
						price: ticket.price.toFixed(2),
						stripeProductId: stripeProducts[index].id,
					})),
					images: images.map((image) => image.file),
					timezone: timezone
				},
			},
			{ new: true },
		)

		if (!newEvent) return sendResponse(res, null, "Failed to update event.", false, ResCode.INTERNAL_SERVER_ERROR)

		return sendResponse(res, newEvent, "Event updated successfully.", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
