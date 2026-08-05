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
import { BUNDLE_APPROVAL_CONFLICT_MESSAGE, BUNDLE_FREE_TICKET_MESSAGE } from "@/lib/premium-bundle"
import { buildUniqueSlug, slugifyFromName, validateEventSlug } from "@/lib/event-slug"
import { isBelowStripeMinimum, BELOW_MIN_PRICE_MESSAGE } from "@/lib/ticket-pricing"
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
	// Host-chosen event URL. Blank/omitted derives one from the event name.
	slug: zod.string().optional(),
	location: zod.string().optional(),
	// The venue on its own, from the Places selection. The schema has always had the field;
	// nothing used to write it, which is why `event-helpers.ts` carries a hardcoded
	// event-id → venue map as a manual stand-in.
	venueName: zod.string().optional(),
	// Arrival instructions. Email-only; see the schema comment.
	entrance: zod.string().max(200).optional(),
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
			// Free ($0) is fine; anything between a cent and 49c is not, because Stripe
			// refuses the charge and the host would only find out at a buyer's checkout.
			price: zod.number().nonnegative().refine((p) => !isBelowStripeMinimum(p), BELOW_MIN_PRICE_MESSAGE),
			description: zod.string().optional(),
			// `.optional()` and never `.default(false)` — undefined must stay undefined so the
			// ticket inherits the event-level requireApproval.
			requireApproval: zod.boolean().optional(),
			// Sells a Jetzy Premium membership with the ticket.
			includesPremium: zod.boolean().optional(),
		}).superRefine((ticket, ctx) => {
			// Stripe has no manual capture in subscription mode, so a bundled ticket can't be
			// authorized-now-captured-on-approval. Reject rather than let a host configure
			// something that would fail at the buyer's checkout.
			if (ticket.includesPremium && ticket.requireApproval) {
				ctx.addIssue({ code: zod.ZodIssueCode.custom, message: BUNDLE_APPROVAL_CONFLICT_MESSAGE, path: ["requireApproval"] })
			}
			// A subscription needs a real charge to start against.
			if (ticket.includesPremium && !(ticket.price > 0)) {
				ctx.addIssue({ code: zod.ZodIssueCode.custom, message: BUNDLE_FREE_TICKET_MESSAGE, path: ["price"] })
			}
		}),
	),
	isPaid: zod.boolean(),
	desc: zod.string().optional(),
	privacy: zod.enum(['public', 'private']).optional().default('public'),
	benefits: zod.string().max(23).optional(),
	locationDisclosedAfterBooking: zod.boolean().optional(),
	showOnMobile: zod.boolean().optional().default(true),
	// DEPRECATED — the "Premium Event" concept was retired. Still accepted so an older mobile
	// client posting them doesn't fail validation, but both are ignored.
	premium: zod.boolean().optional(),
	premiumMemberDiscountPercentage: zod.number().min(0).max(100).optional(),
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
		let { startDate, startTime, endDate, endTime, name, slug: requestedSlug, location, venueName, entrance, longitude, latitude, placeId, capacity, requireApproval, images, videos, tickets, isPaid, desc, privacy, timezone, showParticipants, benefits, locationDisclosedAfterBooking, showOnMobile, datePoll, status, interests } = params

		// Resolve the event URL. A host-supplied slug is validated and made unique; a blank
		// one is derived from the event name, falling back to a random id when the name has
		// nothing usable in it (e.g. emoji only).
		let resolvedSlug: string
		if (requestedSlug && requestedSlug.trim()) {
			const check = validateEventSlug(requestedSlug)
			if (!check.ok) return sendResponse(res, null, check.reason, false, ResCode.BAD_REQUEST)
			resolvedSlug = await buildUniqueSlug(Events, check.slug)
		} else {
			const derived = slugifyFromName(name)
			resolvedSlug = derived
				? await buildUniqueSlug(Events, derived)
				: (generateRandomId(10) as string)
		}

		// The "Premium Event" hosting gate is gone along with the member-discount model —
		// anyone may create any event. Membership is now sold per ticket instead.

		if (!tickets || tickets.length === 0) {
			tickets = [{
				id: generateRandomId(8),
				title: "General Admission",
				price: 0,
				description: "Free ticket for this event."
			}]
		}

		// Require Approval now works for paid tickets too (the card is authorized at checkout
		// and only captured on approval), so the old "force off when every ticket is paid"
		// rule has been removed. `requireApproval` is the event-level default; individual
		// tickets may override it.

		// The old "private Premium Events always require approval" rule is gone with the
		// Premium Event concept. It would also have collided head-on with bundled tickets,
		// which cannot require approval at all (no manual capture in subscription mode).

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

		// A date-only end spans the whole day — compare against end-of-day so a same-day
		// all-day event (both midnight) isn't wrongly rejected.
		const endForCompare = end && !endTime
			? dayjs.tz(`${resolvedEndDate} 00:00`, 'YYYY-MM-DD HH:mm', extractedTimeZone).endOf('day').utc().toDate()
			: end
		if (start && endForCompare && start >= endForCompare) return sendResponse(res, null, "Start date must be less than end date.", false, ResCode.BAD_REQUEST)

		// check if the event has tickets
		if (isPaid && tickets.length === 0) return sendResponse(res, null, "You need to add at least one ticket to a paid event.", false, ResCode.BAD_REQUEST)

		// If event is paid and has tickets, lets format the tickets and create stripe prices for each ticket
		const formattedTickets: Stripe.PriceCreateParams[] = tickets.map((ticket) => ({
			// Math.round, not `* 100` alone: 19.99 * 100 is 1998.9999999999998 in floating
			// point, and Stripe rejects a non-integer unit_amount. Matches clone.ts.
			unit_amount: Math.round(ticket.price * 100),
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
			slug: resolvedSlug,
			ownerId: (session.user as any)._id,
			name,
			location,
			...(venueName ? { venueName } : {}),
			...(entrance ? { entrance } : {}),
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
			// Public events need admin review before they're publicly visible; private events are always auto-approved.
			adminApprovalStatus: privacy === "private" ? "approved" : "pending",
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
				// Only persist an explicit override; leaving it unset means "inherit the event".
				...((ticket as any).requireApproval !== undefined ? { requireApproval: (ticket as any).requireApproval } : {}),
				includesPremium: !!(ticket as any).includesPremium,
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
		// Slug uniqueness is pre-checked, but a concurrent create can still lose the race.
		// Surface that as a usable message instead of leaking Mongo's E11000 text.
		if (error?.code === 11000) {
			return sendResponse(res, null, "That event URL was just taken. Please choose another.", false, ResCode.BAD_REQUEST)
		}
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
