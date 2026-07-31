// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { generateRandomId, sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { CreateEventFormData } from "@/types"
import { DEFAULT_EVENT_IMAGE } from "@/types/const"
import { findUserRecord } from "@/lib/premium"
import { buildUniqueSlug, validateEventSlug } from "@/lib/event-slug"
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
	// Host-chosen event URL. Omitted means "leave unchanged" — never blanked.
	slug: zod.string().optional(),
	location: zod.string().optional(),
	longitude: zod.number().optional(),
	latitude: zod.number().optional(),
	placeId: zod.string().optional(),
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
			// `.optional()` and never `.default(false)` — see the preserve-on-omit logic below.
			requireApproval: zod.boolean().optional(),
		}),
	),
	isPaid: zod.boolean(),
	desc: zod.string().optional(),
	timezone: zod.string().optional(),
	locationDisclosedAfterBooking: zod.boolean().optional(),
	showOnMobile: zod.boolean().optional(),
	premium: zod.boolean().optional(),
	premiumMemberDiscountPercentage: zod.number().min(0).max(100).optional(),
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
		const { startDate, startTime, endDate, endTime, name, slug: requestedSlug, location, longitude, latitude, placeId, capacity, requireApproval, images, videos, tickets, isPaid, desc, timezone, privacy, feedbackFormUrl, benefits, locationDisclosedAfterBooking, showOnMobile, premium, premiumMemberDiscountPercentage, datePoll, status, interests } = params

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

		// Resolve the event URL only when the client actually sent one. Omitting it means
		// "leave unchanged", so an older client or a stale autosave can't blank the slug.
		// `excludeEventId` keeps a no-op save from bumping the slug to "-2".
		let resolvedSlug: string | undefined
		if (requestedSlug !== undefined && requestedSlug.trim()) {
			const check = validateEventSlug(requestedSlug)
			if (!check.ok) return sendResponse(res, null, check.reason, false, ResCode.BAD_REQUEST)
			resolvedSlug = await buildUniqueSlug(Events, check.slug, { excludeEventId: String(event._id) })
		}

		// Only Jetzy Premium subscribers (or admins) can newly turn an event Premium —
		// an already-premium event stays premium even if the host's subscription later lapses.
		if (premium && !event.premium && !isAdmin) {
			const record = await findUserRecord(userId)
			if (!record?.doc?.premiumSubscription?.active) {
				return sendResponse(res, null, "Only Jetzy Premium members can host Premium Events. Subscribe to Jetzy Premium to continue.", false, ResCode.FORBIDDEN)
			}
		}

		// Preserve each ticket's existing _id/stripeProductId across edits (client `ticket.id` is the
		// previous `_id.toString()`) — bookings reference tickets by _id, so regenerating it here would
		// silently orphan every past purchase's ticket-type link. Only mint a new Stripe price when the
		// ticket is new or its price actually changed.
		const existingTicketById = new Map<string, any>()
		;(event.tickets || []).forEach((t: any) => existingTicketById.set(t._id?.toString(), t))

		const resolvedTickets = await Promise.all(tickets.map(async (ticket) => {
			const existing = existingTicketById.get(ticket.id.toString())
			const priceChanged = !existing || Number(existing.price) !== ticket.price
			const stripeProductId = priceChanged
				? (await stripe.prices.create({
					unit_amount: ticket.price * 100,
					currency: "usd",
					product_data: { name: ticket.title },
				} as Stripe.PriceCreateParams)).id
				: existing.stripeProductId

			// Preserve-on-omit: an older client (or an autosave built from a stale form) may not
			// send `requireApproval` at all. Falling back to the stored value means such a save
			// leaves the flag alone instead of silently wiping every per-ticket override.
			const resolvedRequireApproval =
				ticket.requireApproval !== undefined ? ticket.requireApproval
					: existing?.requireApproval !== undefined ? existing.requireApproval
						: undefined

			return {
				...(existing ? { _id: existing._id } : {}),
				name: ticket.title,
				desc: ticket.description,
				price: ticket.price.toFixed(2),
				stripeProductId,
				// Private Premium Events force approval on every ticket — a per-ticket override
				// can't be used to bypass the invite-only approval requirement.
				...((premium && privacy === "private")
					? { requireApproval: true }
					: (resolvedRequireApproval !== undefined ? { requireApproval: resolvedRequireApproval } : {})),
			}
		}))

		// Private Premium Events are invite-only — always require host approval on top
		// of the invite-link/code gate, regardless of ticket pricing. Otherwise this is
		// just the event-level default that tickets without their own flag inherit
		// (see src/lib/ticket-approval.ts) — paid tickets support approval now too.
		const effectiveRequireApproval = (premium && privacy === "private") ? true : requireApproval

		// Auto-generate the private-access code once, the first time an event becomes premium+private. Stable afterwards.
		const newPrivateAccessCode = (premium && privacy === "private" && !event.privateAccessCode)
			? generateRandomId(10) as string
			: undefined

		// Find the event by id and update it
		const updateDoc: any = {
			$set: {
				name,
				...(resolvedSlug !== undefined ? { slug: resolvedSlug } : {}),
				location,
				// Only overwrite saved coordinates when the client actually sent new ones
				// (e.g. the user re-picked a location) — otherwise leave the existing
				// coordinates untouched instead of wiping them with undefined.
				...(typeof longitude === "number" && typeof latitude === "number" ? {
					coordinates: { long: longitude, lat: latitude, placeId },
				} : {}),
				desc: desc ?? "",
				isPaid,
				capacity,
				// Event-level default for tickets that don't set their own flag (paid tickets support
				// approval now — card authorized at checkout, captured on approval). Private Premium
				// Events always force this on, regardless of what the client sent — see above.
				requireApproval: effectiveRequireApproval,
				tickets: resolvedTickets,
				images: images.length > 0 ? images.map((image) => image.file) : [DEFAULT_EVENT_IMAGE],
				videos: videos?.map((v) => v.file) ?? [],
				timezone: timezone || 'UTC',
				privacy,
				// Private events are always auto-approved. A public event only needs a
				// fresh admin review when it's newly becoming public (was private before) —
				// otherwise leave its current approval status untouched (don't re-trigger
				// pending on every unrelated edit, and don't silently approve a pending one).
				...(privacy === "private"
					? { adminApprovalStatus: "approved" }
					: (event.privacy === "private" ? { adminApprovalStatus: "pending" } : {})),
				feedbackFormUrl,
				benefits,
				locationDisclosedAfterBooking: locationDisclosedAfterBooking ?? false,
				showOnMobile: showOnMobile ?? false,
				premium: premium ?? false,
				premiumMemberDiscountPercentage: premium ? (premiumMemberDiscountPercentage ?? 0) : 0,
				...(newPrivateAccessCode ? { privateAccessCode: newPrivateAccessCode } : {}),
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
		// A real save always supersedes any autosaved shadow draft ("draft 2")
		unsetDoc.draftRevision = ""
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
		// Slug uniqueness is pre-checked, but a concurrent save can still lose the race.
		if (error?.code === 11000) {
			return sendResponse(res, null, "That event URL was just taken. Please choose another.", false, ResCode.BAD_REQUEST)
		}
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
