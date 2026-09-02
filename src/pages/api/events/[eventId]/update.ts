// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { generateRandomId, sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { CreateEventFormData } from "@/types"
import { DEFAULT_EVENT_IMAGE } from "@/types/const"
import { resolveTickets } from "@/lib/event-tickets"
import { buildUniqueSlug, nextSlugHistory, validateEventSlug } from "@/lib/event-slug"
import { isBelowStripeMinimum, BELOW_MIN_PRICE_MESSAGE } from "@/lib/ticket-pricing"
import zod from "zod"
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
	name: zod.string().nonempty("Give your event a name."),
	// Host-chosen event URL. Omitted means "leave unchanged" — never blanked.
	slug: zod.string().optional(),
	location: zod.string().optional(),
	// The venue on its own, from the Places selection.
	venueName: zod.string().optional(),
	// Arrival instructions. Email-only; see the schema comment.
	entrance: zod.string().max(200).optional(),
	longitude: zod.number().optional(),
	latitude: zod.number().optional(),
	placeId: zod.string().optional(),
	// Real sentences, not zod's defaults: these surface straight to the host in a toast, and
	// "Number must be greater than or equal to 0" names neither the field nor the fix.
	capacity: zod.number().nonnegative("Capacity can't be negative. Use 0 for unlimited."),
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
	// Banner order across images + videos (urls). See IEvent.mediaOrder.
	mediaOrder: zod.array(zod.string()).optional(),
	tickets: zod.array(
		zod.object({
			id: zod.string().nonempty(),
			title: zod.string().nonempty("Give this ticket a name."),
			// Free ($0) is fine; anything between a cent and 49c is not, because Stripe
			// refuses the charge and the host would only find out at a buyer's checkout.
			price: zod
				.number({ invalid_type_error: "Enter a price, or 0 to make this ticket free." })
				.nonnegative("Price can't be negative. Use 0 to make this ticket free.")
				.refine((p) => !isBelowStripeMinimum(p), BELOW_MIN_PRICE_MESSAGE),
			description: zod.string().optional(),
			// `.optional()` and never `.default(false)` — see the preserve-on-omit logic below.
			requireApproval: zod.boolean().optional(),
			// Sells a Jetzy Premium membership with the ticket. Also preserve-on-omit.
			// Which memberships this ticket sells. Omitted means "unchanged" — see the
			// preserve-on-omit rule below.
			memberships: zod.array(zod.string()).optional(),
			// Billing interval the bundled membership is sold at. Optional, and omitting it means
			// UNCHANGED on update — same preserve-on-omit rule as `requireApproval` and
			// `memberships`, so a stale autosave can't silently move an annual ticket to monthly.
			membershipInterval: zod.enum(["month", "year"]).optional(),
			/** @deprecated Superseded by `memberships`; still accepted from older clients. */
			includesPremium: zod.boolean().optional(),
		}),
	),
	isPaid: zod.boolean(),
	desc: zod.string().optional(),
	timezone: zod.string().optional(),
	locationDisclosedAfterBooking: zod.boolean().optional(),
	showOnMobile: zod.boolean().optional(),
	// DEPRECATED — the "Premium Event" concept was retired. Still accepted so an older client
	// posting them doesn't fail validation, but both are ignored.
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
			// Still accepted so an older client doesn't fail validation, but IGNORED: votes are
			// preserved server-side from the stored options, keyed by option id.
			votes: zod.array(zod.string()).optional(),
		})),
	}).optional(),
	privacy: zod.enum(['public', 'private']).optional(),
	feedbackFormUrl: zod.string().optional(),
	benefits: zod.string().max(23).optional(),
})

// create stripe instance

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
		const { startDate, startTime, endDate, endTime, name, slug: requestedSlug, location, venueName, entrance, longitude, latitude, placeId, capacity, requireApproval, images, videos, mediaOrder, tickets, isPaid, desc, timezone, privacy, feedbackFormUrl, benefits, locationDisclosedAfterBooking, showOnMobile, datePoll, status, interests } = params

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
		let resolvedPreviousSlugs: string[] | undefined
		if (requestedSlug !== undefined && requestedSlug.trim()) {
			const check = validateEventSlug(requestedSlug)
			if (!check.ok) return sendResponse(res, null, check.reason, false, ResCode.BAD_REQUEST)
			resolvedSlug = await buildUniqueSlug(Events, check.slug, { excludeEventId: String(event._id) })

			// Renaming retires the old url rather than deleting it — `/[slug].tsx` redirects
			// former slugs to the current one, so RSVP emails and QR codes already in circulation
			// keep working. `null` means the slug didn't actually change, and the field is then
			// left out of the $set entirely.
			//
			// Drafts are excluded: nothing has been shared yet, so there is no link to keep
			// alive — and autosave on a draft PUTs the whole form every ~2s, which would
			// otherwise retire (and permanently reserve) every half-typed slug along the way.
			// A published event's autosave writes `draftRevision` instead, never this path.
			if (event.status !== "draft") {
				resolvedPreviousSlugs = nextSlugHistory(event.slug, resolvedSlug, event.previousSlugs) ?? undefined
			}
		}

		// The "Premium Event" hosting gate is gone with the member-discount model — membership
		// is sold per ticket now, so there is nothing to gate here.

		// Ticket resolution lives in src/lib/event-tickets.ts, shared with the inline tickets
		// endpoint. It preserves each ticket's `_id` and `stripeProductId`, mints a new Stripe
		// price only when the price actually changed, and treats requireApproval / memberships /
		// membershipInterval as preserve-on-omit. Two copies of that would be two chances to
		// orphan a booking or double-charge a buyer.
		const resolvedTickets = await resolveTickets(event.tickets as any, tickets as any)

		// Date poll: votes are never taken from the client and never wiped by a save.
		//
		// This route used to write `{isActive:false, question:'', options:[]}` on every save
		// where the submitted poll wasn't active — so disabling the poll, or merely picking a
		// fixed start date (which clears the poll client-side), destroyed every vote guests had
		// cast. Same rule as the inline editor in `details.ts` now: surviving options keep their
		// votes, matched by option id, and turning the poll off only flips `isActive`.
		const storedPollOptions = ((event as any).datePoll?.options || []) as any[]
		const pollVotesById = new Map<string, string[]>(storedPollOptions.map((o: any) => [o.id, o.votes || []]))
		const datePollSet: any = {}
		if (datePoll === undefined) {
			// Preserve-on-omit, like venueName/mediaOrder: a client that doesn't send the poll
			// must not switch one off.
		} else if (datePoll.isActive && datePoll.options?.length > 0) {
			datePollSet.datePoll = {
				isActive: true,
				question: datePoll.question || '',
				options: datePoll.options.map(opt => ({
					id: opt.id,
					date: opt.date,
					time: opt.time || '',
					label: opt.label || '',
					// Ignores anything the client sent for `votes` — the stored value wins.
					votes: pollVotesById.get(opt.id) || [],
				})),
			}
		} else {
			// Dotted path on purpose: question, options and votes are left alone, so re-enabling
			// the poll brings it back exactly as it was.
			datePollSet["datePoll.isActive"] = false
		}

		// The event-level default that tickets without their own flag inherit
		// (see src/lib/ticket-approval.ts). The old private-Premium force-on rule is gone.
		const effectiveRequireApproval = requireApproval

		// Find the event by id and update it
		const updateDoc: any = {
			$set: {
				name,
				...(resolvedSlug !== undefined ? { slug: resolvedSlug } : {}),
				...(resolvedPreviousSlugs !== undefined ? { previousSlugs: resolvedPreviousSlugs } : {}),
				location,
				// Same preserve-on-omit rule as the coordinates below: an older client, or an
				// autosave built from a stale form, may not send `venueName` at all. Writing
				// `undefined` would wipe a venue name that was set by hand.
				...(venueName !== undefined ? { venueName } : {}),
				// Same preserve-on-omit rule — an autosave from a stale form must not wipe it.
				...(entrance !== undefined ? { entrance } : {}),
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
				// Preserve-on-omit, like venueName above: an older client or an autosave built
				// from a stale form doesn't send it, and writing undefined would throw away an
				// order the host arranged by hand.
				...(mediaOrder !== undefined ? { mediaOrder } : {}),
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
				status: status ?? 'published',
				interests: interests ?? [],
				// Built above, with the stored votes re-attached by option id.
				...datePollSet,
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
