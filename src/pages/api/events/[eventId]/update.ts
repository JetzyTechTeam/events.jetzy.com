// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { generateRandomId, sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { CreateEventFormData } from "@/types"
import { DEFAULT_EVENT_IMAGE } from "@/types/const"
import zod from "zod"
import Stripe from "stripe"
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
	startDate: zod.string().optional(),
	startTime: zod.string().optional(),
	endDate: zod.string().optional(),
	endTime: zod.string().optional(),
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
	videos: zod.array(
		zod.object({
			id: zod.string().optional(),
			file: zod.string().optional(),
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
	timezone: zod.string().optional(),
	locationDisclosedAfterBooking: zod.boolean().optional(),
	showOnMobile: zod.boolean().optional(),
	status: zod.enum(['draft', 'published']).optional(),
	interests: zod.array(zod.string()).optional(),
	datePoll: zod.object({
		isActive: zod.boolean(),
		question: zod.string().optional(),
		options: zod.array(zod.object({
			id: zod.string(),
			date: zod.string(),
			time: zod.string().optional(),
			label: zod.string().optional(),
			votes: zod.array(zod.string()).optional(),
		})),
	}).optional(),
	privacy: zod.enum(['public', 'private']).optional(),
	feedbackFormUrl: zod.string().optional(),
	benefits: zod.string().max(23).optional(),
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

		const { eventId } = req.query

		// validate the request body
		const data = schema.safeParse({ ...params, eventId })
		if (!data.success) return sendResponse(res, data.error.errors, "Your request could not be complete, please check your input and try again.", false, ResCode.BAD_REQUEST)

		// Desctructure the request body
		const { startDate, startTime, endDate, endTime, name, location, capacity, requireApproval, images, videos, tickets, isPaid, desc, timezone, privacy, feedbackFormUrl, benefits, locationDisclosedAfterBooking, showOnMobile, datePoll, status, interests } = params

		// construct datetime for start and end dates
		const extractedTimeZone = timezone?.split(') ')[1] || 'UTC'
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
		if (datePoll?.isActive && datePoll.options?.length > 0) {
			start = undefined
			end = undefined
		}

		// check if start date is greater than end date — a date-only end spans the whole
		// day, so compare against end-of-day (a same-day all-day event isn't rejected).
		const endForCompare = end && !endTime
			? dayjs.tz(`${resolvedEndDate} 00:00`, 'YYYY-MM-DD HH:mm', extractedTimeZone).endOf('day').utc().toDate()
			: end
		if (start && endForCompare && start >= endForCompare) return sendResponse(res, null, "Start date must be less than end date.", false, ResCode.BAD_REQUEST)

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

		// Ownership check — admin can edit any event, user can only edit their own
		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const userId = (session.user as any)?._id?.toString()
		if (!isAdmin && event.ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Forbidden. You can only edit your own events.", false, ResCode.FORBIDDEN)
		}

		// Find the event by id and update it
		const updateDoc: any = {
			$set: {
				name,
				location,
				desc: desc ?? "",
				isPaid,
				capacity,
				// Require Approval gates the FREE-ticket registrations — force off only when every ticket is paid.
				requireApproval: ((tickets || []).length > 0 && (tickets || []).every((t: any) => Number(t.price) > 0)) ? false : requireApproval,
				tickets: tickets.map((ticket, index) => ({
					name: ticket.title,
					desc: ticket.description,
					price: ticket.price.toFixed(2),
					stripeProductId: stripeProducts[index].id,
				})),
				images: images.length > 0 ? images.map((image) => image.file) : [DEFAULT_EVENT_IMAGE],
				videos: videos?.map((v) => v.file) ?? [],
				timezone: timezone || 'UTC',
				privacy,
				feedbackFormUrl,
				benefits,
				locationDisclosedAfterBooking: locationDisclosedAfterBooking ?? false,
				showOnMobile: showOnMobile ?? false,
				status: status ?? 'published',
				interests: interests ?? [],
				...(datePoll?.isActive && datePoll.options?.length > 0 ? {
					datePoll: {
						isActive: true,
						question: datePoll.question || '',
						options: datePoll.options.map(opt => ({
							id: opt.id,
							date: opt.date,
							time: opt.time || '',
							label: opt.label || '',
							votes: opt.votes || [],
						})),
					},
				} : { datePoll: { isActive: false, question: '', options: [] } }),
			},
		}

		if (start) updateDoc.$set.startsOn = start
		if (end) updateDoc.$set.endsOn = end

		const unsetDoc: any = {}
		if (!start) unsetDoc.startsOn = ""
		if (!end) unsetDoc.endsOn = ""
		if (Object.keys(unsetDoc).length > 0) updateDoc.$unset = unsetDoc

		// Record whether an explicit time was set (empty time string = date-only event)
		updateDoc.$set.hasStartTime = !!(start && startTime)
		updateDoc.$set.hasEndTime = !!(end && endTime)

		const newEvent = await Events.findOneAndUpdate(
			{
				_id: new Types.ObjectId(eventId as string),
			},
			updateDoc,
			{ new: true },
		)

		if (!newEvent) return sendResponse(res, null, "Failed to update event.", false, ResCode.INTERNAL_SERVER_ERROR)

		// Update EventTracker capacity if it exists
		const { EventTracker } = await import("@/models/events/event-tracker")
		const eventTracker = await EventTracker.findOne({ eventId: new Types.ObjectId(eventId as string) })
		if (eventTracker) {
			eventTracker.eventCapacity = capacity
			await eventTracker.save()
		}

		return sendResponse(res, newEvent, "Event updated successfully.", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
