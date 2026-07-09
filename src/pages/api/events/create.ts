// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { generateRandomId, sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { CreateEventFormData } from "@/types"
import { DEFAULT_EVENT_IMAGE } from "@/types/const"
import zod from "zod"
import Stripe from "stripe"
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

// create validation schema

const datePollOptionSchema = zod.object({
	id: zod.string(),
	date: zod.string(),
	time: zod.string().optional(),
	label: zod.string().optional(),
	votes: zod.array(zod.string()).optional(),
})

const schema = zod.object({
	startDate: zod.string().optional(),
	startTime: zod.string().optional(),
	endDate: zod.string().optional(),
	endTime: zod.string().optional(),
	name: zod.string().nonempty(),
	location: zod.string().optional(),
	longitude: zod.number().optional(),
	latitude: zod.number().optional(),
	placeId: zod.string().optional(),
	capacity: zod.number().nonnegative(),
	requireApproval: zod.boolean(),
	images: zod.array(
		zod.object({
			id: zod.string().nonempty(),
			file: zod.string().nonempty(),
		}),
	),
	videos: zod.array(
		zod.object({
			id: zod.string().nonempty(),
			file: zod.string().nonempty(),
		}),
	).optional(),
	tickets: zod.array(
		zod.object({
			id: zod.string().nonempty(),
			title: zod.string().nonempty(),
			price: zod.number().nonnegative(),
			description: zod.string().optional(),
		}),
	),
	isPaid: zod.boolean(),
	desc: zod.string().optional(),
	privacy: zod.enum(['public', 'private']).optional().default('public'),
	benefits: zod.string().max(23).optional(),
	locationDisclosedAfterBooking: zod.boolean().optional(),
	showOnMobile: zod.boolean().optional().default(true),
	status: zod.enum(['draft', 'published']).optional().default('published'),
	interests: zod.array(zod.string()).optional().default([]),
	datePoll: zod.object({
		isActive: zod.boolean(),
		question: zod.string().optional(),
		options: zod.array(datePollOptionSchema),
	}).optional(),
})

// create stripe instance
const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)

	try {
		// make sure user is logged-in before creating events
		if (!session) return sendResponse(res, null, "You need to be logged in to create an event.", false, ResCode.UNAUTHORIZED)

		// get the request body
		const body = req?.body as { payload: string }
		const params: CreateEventFormData = JSON.parse(body.payload) as CreateEventFormData

		// validate the request body
		const data = schema.safeParse(params)
		if (!data.success) return sendResponse(res, data.error.errors, "Your request could not be complete, please check your input and try again.", false, ResCode.BAD_REQUEST)

		// Desctructure the request body
		let { startDate, startTime, endDate, endTime, name, location, longitude, latitude, placeId, capacity, requireApproval, images, videos, tickets, isPaid, desc, privacy, timezone, showParticipants, benefits, locationDisclosedAfterBooking, showOnMobile, datePoll, status, interests } = params

		if (!tickets || tickets.length === 0) {
			tickets = [{
				id: generateRandomId(8),
				title: "General Admission",
				price: 0,
				description: "Free ticket for this event."
			}]
		}

		const effectiveTimezone = timezone && timezone.trim() !== '' ? timezone : 'UTC'
		const extractedTimeZone = effectiveTimezone.split(') ')[1] || effectiveTimezone
		let start: Date | undefined
		let end: Date | undefined

		// An end time with no end date means the event ends that time on the start date (same-day end)
		const resolvedEndDate = endDate || (endTime ? startDate : undefined)

		// Time is optional — default to midnight when only a date is provided
		if (startDate) {
			start = dayjs.tz(`${startDate} ${startTime || '00:00'}`, 'YYYY-MM-DD HH:mm', extractedTimeZone).utc().toDate()
		}
		if (resolvedEndDate) {
			end = dayjs.tz(`${resolvedEndDate} ${endTime || '00:00'}`, 'YYYY-MM-DD HH:mm', extractedTimeZone).utc().toDate()
		}

		// An active date poll is mutually exclusive with fixed dates — poll wins, drop the dates
		const datePollActive = !!(datePoll?.isActive && datePoll.options.length > 0)
		if (datePollActive) {
			start = undefined
			end = undefined
		}

		if (start && end && start >= end) return sendResponse(res, null, "Start date must be less than end date.", false, ResCode.BAD_REQUEST)

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

		// create event
		const newEvent = await Events.create({
			slug: generateRandomId(10),
			ownerId: (session.user as any)._id,
			name,
			location,
			coordinates: {
				long: longitude,
				lat: latitude,
				placeId,
			},
			desc: desc ?? "",
			...(start ? { startsOn: start } : {}),
			...(end ? { endsOn: end } : {}),
			hasStartTime: !!(start && startTime),
			hasEndTime: !!(end && endTime),
			isPaid,
			privacy,
			images: images.length > 0 ? images.map((image) => image.file) : [DEFAULT_EVENT_IMAGE],
			videos: videos?.map((v) => v.file) ?? [],
			capacity,
			requireApproval,
			showParticipants,
			timezone: effectiveTimezone,
			tickets: tickets.map((ticket, index) => ({
				name: ticket.title,
				desc: ticket.description,
				price: ticket.price.toFixed(2),
				stripeProductId: stripeProducts[index].id,
			})),
			benefits,
			locationDisclosedAfterBooking: locationDisclosedAfterBooking ?? false,
			showOnMobile: showOnMobile ?? true,
			status: status ?? 'published',
			interests: interests ?? [],
			datePoll: datePoll?.isActive && datePoll.options.length > 0
				? {
					isActive: true,
					question: datePoll.question || "",
					options: datePoll.options.map((opt) => ({
						id: opt.id,
						date: opt.date,
						time: opt.time || "",
						label: opt.label || "",
						votes: [],
					})),
				}
				: undefined,
		})

		if (!newEvent) return sendResponse(res, null, "Failed to create event.", false, ResCode.INTERNAL_SERVER_ERROR)

		// Create event tracker
		await newEvent.createEventTracker(capacity)

		return sendResponse(res, newEvent, "Event created successfully.", true, ResCode.CREATED)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
