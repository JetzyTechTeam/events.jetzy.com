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
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

// create validation schema
const schema = zod.object({
	eventId: zod.string().nonempty(),
	startDate: zod.string().nonempty(),
	startTime: zod.string().nonempty(),
	endDate: zod.string().nonempty(),
	endTime: zod.string().nonempty(),
	name: zod.string().nonempty(),
	location: zod.string().optional(),
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
			description: zod.string().optional(),
			disabled: zod.boolean().optional(),
			dueDate: zod.string().optional(),
			quantityLimit: zod.number().positive().optional(),
			quantitySold: zod.number().nonnegative().optional(),
		}),
	),
	isPaid: zod.boolean(),
	desc: zod.string().nonempty(),
	timezone: zod.string().nonempty(),
	interestCategory: zod.string().optional(),
	interestSubCategory: zod.string().optional(),
})

// create stripe instance
const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)

	try {
		// make sure user is logged-in before updating events
		if (!session) return sendResponse(res, null, "You need to be logged in to update an event.", false, ResCode.UNAUTHORIZED)

		// get the request body
		const body = req?.body as { payload: string }
		const params: CreateEventFormData = JSON.parse(body.payload) as CreateEventFormData

		const { eventId } = req.query

		// validate the request body
		const data = schema.safeParse({ ...params, eventId })
		if (!data.success) return sendResponse(res, data.error.errors, "Your request could not be complete, please check your input and try again.", false, ResCode.BAD_REQUEST)

		// Get the event first to check ownership
		const event = await Events.findOne({ _id: new Types.ObjectId(eventId as string), isDeleted: false })
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		// Check permissions: Admin or Owner
		const user = session.user as any
		const isAdmin = user.role === "admin" || user.role === "super admin"
		const isOwner = event.ownerId?.toString() === user._id || event.host?.email === user.email

		if (!isAdmin && !isOwner) {
			return sendResponse(res, null, "You don't have permission to update this event.", false, ResCode.FORBIDDEN)
		}

		// Desctructure the request body
		const { startDate, startTime, endDate, endTime, name, location, venueName, capacity, requireApproval, images, tickets, isPaid, desc, timezone, privacy, interestCategory, interestSubCategory, host } = params

		// construct datetime for start and end dates
		// Extract timezone - handle both "(UTC-05:00) America/New_York" format and plain timezone name
		let extractedTimeZone: string | undefined
		if (timezone?.includes(') ')) {
			extractedTimeZone = timezone.split(') ')[1]
		} else {
			extractedTimeZone = timezone
		}

		// Validate timezone exists
		if (!extractedTimeZone || extractedTimeZone.trim() === '') {
			return sendResponse(res, null, "Please select a timezone from the dropdown (e.g., 'New York' or 'London').", false, ResCode.BAD_REQUEST)
		}

		// Validate that extractedTimeZone is a valid timezone (not a date format)
		if (extractedTimeZone.match(/^\d{4}-\d{2}-\d{2}/) || extractedTimeZone.match(/^\d{2}:\d{2}$/)) {
			return sendResponse(res, null, "Please select a timezone from the dropdown instead of entering a date or time.", false, ResCode.BAD_REQUEST)
		}

		// Declare start and end dates outside try block so they're accessible later
		let start: Date
		let end: Date

		try {
			start = dayjs.tz(`${startDate} ${startTime}`, 'YYYY-MM-DD HH:mm', extractedTimeZone).utc().toDate()
			end = dayjs.tz(`${endDate} ${endTime}`, 'YYYY-MM-DD HH:mm', extractedTimeZone).utc().toDate()

			// check if start date is greater than end date
			if (start >= end) return sendResponse(res, null, "Start date must be less than end date.", false, ResCode.BAD_REQUEST)
		} catch (timezoneError: any) {
			console.error("[events/update] Timezone conversion error:", timezoneError)
			return sendResponse(res, null, `Invalid timezone. Please select a valid timezone from the dropdown (e.g., 'New York' or 'London').`, false, ResCode.BAD_REQUEST)
		}

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

		// Get existing event to preserve ticket states
		const existingEvent = await Events.findById(new Types.ObjectId(eventId as string))
		
		// Auto-disable logic: Check if tickets should be disabled based on due date or quantity limit
		// But respect user's manual enable/disable setting - only auto-disable if conditions require it
		const now = new Date()
		const processedTickets = tickets.map((ticket, index) => {
			// Find existing ticket to preserve its disabled state if not explicitly set
			const existingTicket = existingEvent?.tickets?.find((t: any) => {
				// Try to match by ID or by name (fallback)
				return t._id?.toString() === ticket.id || t.name === ticket.title
			})
			
			// Check auto-disable conditions first
			const isExpired = ticket.dueDate && new Date(ticket.dueDate) < now
			const isSoldOut = ticket.quantityLimit && ticket.quantitySold !== undefined && ticket.quantitySold >= ticket.quantityLimit
			
			// Determine if ticket should be disabled:
			// 1. If expired or sold out, it MUST be disabled (safety requirement)
			// 2. Otherwise, respect the user's manual setting (ticket.disabled)
			// 3. If ticket.disabled is undefined, preserve existing state or default to false
			let shouldDisable: boolean
			if (isExpired || isSoldOut) {
				// Conditions require disable - override user setting for safety
				shouldDisable = true
			} else {
				// No conditions require disable - respect user's manual setting
				// If ticket.disabled is explicitly set (true or false), use that value
				// If undefined, preserve the existing ticket's disabled state (default to false/enabled)
				if (typeof ticket.disabled === 'boolean') {
					// User explicitly set disabled to true or false - respect that
					shouldDisable = ticket.disabled
				} else {
					// ticket.disabled is undefined - preserve existing state or default to enabled
					shouldDisable = existingTicket?.disabled === true
				}
			}
			
			return {
				name: ticket.title,
				desc: ticket.description || "",
				price: ticket.price.toFixed(2),
				stripeProductId: stripeProducts[index].id,
				disabled: shouldDisable,
				dueDate: ticket.dueDate || undefined,
				quantityLimit: ticket.quantityLimit || undefined,
				quantitySold: ticket.quantitySold || 0,
			}
		})

		// Find the event by id and update it
		const updateResult = await Events.updateOne(
			{
				_id: new Types.ObjectId(eventId as string),
			},
			{
				$set: {
					name,
					location,
					desc: formatTextWithLineBreaks(desc),
					startsOn: start,
					endsOn: end,
					isPaid,
					capacity,
					requireApproval,
					tickets: processedTickets,
					images: images.map((image) => image.file),
					timezone: timezone,
					privacy,
					interestCategory: interestCategory || undefined,
					interestSubCategory: interestSubCategory || undefined,
					host: host && host.name?.trim() ? host : undefined,
				},
			}
		)

		if (!updateResult || updateResult.matchedCount === 0) {
			return sendResponse(res, null, "Failed to update event.", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// Sync EventTracker.eventCapacity with event.capacity if capacity was changed
		if (capacity !== undefined) {
			try {
				const { EventTracker } = await import("@/models/events/event-tracker")
				await EventTracker.findOneAndUpdate(
					{ eventId: new Types.ObjectId(eventId as string) },
					{ $set: { eventCapacity: capacity } },
					{ upsert: false } // Don't create if it doesn't exist
				)
			} catch (trackerError: any) {
				console.error("[events/update] Failed to sync EventTracker capacity:", trackerError.message)
				// Don't fail the request if tracker update fails
			}
		}

		// Fetch the updated event to return
		const updatedEvent = await Events.findOne({ _id: new Types.ObjectId(eventId as string) })
		if (!updatedEvent) {
			return sendResponse(res, null, "Event updated but could not be retrieved.", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		return sendResponse(res, updatedEvent, "Event updated successfully.", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
