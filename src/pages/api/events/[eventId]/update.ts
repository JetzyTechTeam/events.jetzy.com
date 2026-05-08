// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { generateRandomId, sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { CreateEventFormData } from "@/types"
import zod from "zod"
import Stripe from "stripe"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { stripHtml } from "@/utils/text"

dayjs.extend(utc)
dayjs.extend(timezone)

// create validation schema
const schema = zod.object({
	eventId: zod.string().nonempty(),
	startDate: zod.string().optional(),
	startTime: zod.string().optional(),
	endDate: zod.string().optional(),
	endTime: zod.string().optional(),
	name: zod.string().optional().default(''),
	location: zod.string().optional().default(''),
	capacity: zod.coerce.number().nonnegative().optional().default(0),
	requireApproval: zod.boolean().optional().default(false),
	images: zod.array(
		zod.object({
			id: zod.string().optional(),
			file: zod.string().optional(),
		}),
	).optional().default([]),
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
	).optional().default([]),
	isPaid: zod.boolean().optional().default(false),
	desc: zod.string().optional().default(''),
	timezone: zod.string().optional(),
	locationDisclosedAfterBooking: zod.boolean().optional(),
	datePoll: zod.object({
		isActive: zod.boolean(),
		question: zod.string().optional(),
		options: zod.array(zod.object({
			id: zod.string(),
			date: zod.string(),
			time: zod.string(),
			label: zod.string().optional(),
			votes: zod.array(zod.string()).optional(),
		})),
	}).optional(),
	feedbackFormUrl: zod.string().optional(),
	benefits: zod.string().max(23).optional(),
	status: zod.enum(['draft', 'published']).optional(),
	interests: zod.array(zod.string()).optional(),
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

		const isDraft = (params.status ?? 'published') === 'draft'

		// validate the request body
		const data = schema.safeParse({ ...params, eventId })
		if (!data.success) return sendResponse(res, data.error.errors, "Your request could not be complete, please check your input and try again.", false, ResCode.BAD_REQUEST)

		if (!params.name?.trim()) return sendResponse(res, null, "Event name is required.", false, ResCode.BAD_REQUEST)

		if (!isDraft) {
			if (!stripHtml(params.desc || "").trim()) return sendResponse(res, null, "Description is required.", false, ResCode.BAD_REQUEST)
			if (!params.location?.trim()) return sendResponse(res, null, "Location is required.", false, ResCode.BAD_REQUEST)
			if (!params.images || params.images.length === 0) return sendResponse(res, null, "You need to add at least one image to an event.", false, ResCode.BAD_REQUEST)
		}

		// Desctructure the request body
		const { startDate, startTime, endDate, endTime, name, location, capacity, requireApproval, images, videos, tickets, isPaid, desc, timezone, privacy, feedbackFormUrl, benefits, locationDisclosedAfterBooking, datePoll, status, interests } = params

		// construct datetime for start and end dates
		const extractedTimeZone = timezone?.split(') ')[1] || 'UTC'
		let start: Date | undefined
		let end: Date | undefined
		if (startDate && startTime) {
			start = dayjs.tz(`${startDate} ${startTime}`, 'YYYY-MM-DD HH:mm', extractedTimeZone).utc().toDate()
		}
		if (endDate && endTime) {
			end = dayjs.tz(`${endDate} ${endTime}`, 'YYYY-MM-DD HH:mm', extractedTimeZone).utc().toDate()
		}

		// check if start date is greater than end date
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
				desc: desc,
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
				videos: videos?.map((v) => v.file) ?? [],
				timezone: timezone || 'UTC',
				privacy,
				feedbackFormUrl,
				benefits,
				status: status ?? 'published',
				interests: interests ?? [],
				locationDisclosedAfterBooking: locationDisclosedAfterBooking ?? false,
				...(datePoll?.isActive && datePoll.options?.length > 0 ? {
					datePoll: {
						isActive: true,
						question: datePoll.question || '',
						options: datePoll.options.map(opt => ({
							id: opt.id,
							date: opt.date,
							time: opt.time,
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
