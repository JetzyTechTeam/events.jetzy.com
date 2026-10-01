import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { mediaLimitRefusal } from "@/lib/event-media-limit"
import { EVENT_TITLE_RAW_LIMIT } from "@/lib/event-title"
import {
	BENEFITS_RAW_LIMIT,
	DATE_POLL_OPTION_LABEL_LIMIT,
	DATE_POLL_QUESTION_LIMIT,
	EVENT_DESC_LIMIT,
	EVENT_ENTRANCE_LIMIT,
	EVENT_FIELD_MESSAGES,
	EVENT_LOCATION_LIMIT,
	EVENT_TIMEZONE_LIMIT,
	EVENT_VENUE_NAME_LIMIT,
	benefitChipsWithinLimit,
	benefitCountWithinLimit,
	countChars,
} from "@/lib/event-field-limits"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import zod from "zod"
import { zodIssuesToMessage } from "@/lib/zod-error"
import { isAwaitingAdminReview } from "@/lib/event-approval"
import { notifyOwnerEventSubmitted } from "@/lib/event-approval-notify"

const schema = zod.object({
	// The title cap is 150 characters THAT ARE NOT WHITESPACE (`@/lib/event-title`), so a legitimate
	// title can be far longer raw than the 150 it counts as. This is the raw backstop, not the rule.
	// Billed in CODE POINTS, like `clampEventTitle` — `.max()` counts UTF-16 units, so a title the
	// clamp accepts could still 400 here once it held emoji, which is exactly what that module
	// promises can never happen.
	name: zod
		.string()
		.min(1, "Give your event a name.")
		.refine((v) => countChars(v) <= EVENT_TITLE_RAW_LIMIT, { message: "That title is too long." })
		.optional(),
	desc: zod.string().max(EVENT_DESC_LIMIT, EVENT_FIELD_MESSAGES.descTooLong).optional(),
	// The 23-char cap is PER CHIP, never for the whole stored value — `benefits` is ONE
	// comma-separated string. Same rule, same sentence, as create.ts / update.ts.
	benefits: zod
		.string()
		.max(BENEFITS_RAW_LIMIT, EVENT_FIELD_MESSAGES.benefitsTooLong)
		.optional()
		.refine(benefitChipsWithinLimit, { message: EVENT_FIELD_MESSAGES.benefitTooLong })
		.refine(benefitCountWithinLimit, { message: EVENT_FIELD_MESSAGES.tooManyBenefits }),
	images: zod.array(zod.string().min(1)).optional(),
	videos: zod.array(zod.string().min(1)).optional(),
	mediaOrder: zod.array(zod.string().min(1)).optional(),
	location: zod.string().max(EVENT_LOCATION_LIMIT, EVENT_FIELD_MESSAGES.locationTooLong).optional(),
	venueName: zod.string().max(EVENT_VENUE_NAME_LIMIT, EVENT_FIELD_MESSAGES.venueNameTooLong).optional(),
	entrance: zod.string().max(EVENT_ENTRANCE_LIMIT, EVENT_FIELD_MESSAGES.entranceTooLong).optional(),
	latitude: zod.number().optional(),
	longitude: zod.number().optional(),
	placeId: zod.string().optional(),
	timezone: zod.string().max(EVENT_TIMEZONE_LIMIT, EVENT_FIELD_MESSAGES.timezoneTooLong).optional(),
	// Dates arrive already resolved to an instant, NOT as the date/time/timezone triple that
	// `update.ts` splits and reassembles. That round trip is where its date bugs live, and this
	// endpoint has no reason to repeat it. Empty string clears the date.
	startsOn: zod.string().optional(),
	endsOn: zod.string().optional(),
	hasStartTime: zod.boolean().optional(),
	hasEndTime: zod.boolean().optional(),
	// Interests are ids as strings — either a sub-interest id or a whole category id, which is
	// what the mobile app writes when someone tags a top-level interest.
	interests: zod.array(zod.string()).optional(),
	// Event Options. The event-level default that tickets without their own flag inherit.
	requireApproval: zod.boolean().optional(),
	locationDisclosedAfterBooking: zod.boolean().optional(),
	showOnMobile: zod.boolean().optional(),
	// Curation tag — badge + filter only. Not the deprecated `premium` field.
	premiumEvent: zod.boolean().optional(),
	capacity: zod.number().int(EVENT_FIELD_MESSAGES.capacityNotWhole).min(0, EVENT_FIELD_MESSAGES.capacityNegative).optional(),
	privacy: zod.enum(["public", "private"]).optional(),
	// Votes are NOT accepted from the client — they are preserved server-side by option id.
	datePoll: zod
		.object({
			isActive: zod.boolean(),
			question: zod.string().max(DATE_POLL_QUESTION_LIMIT, EVENT_FIELD_MESSAGES.pollQuestionTooLong).optional(),
			options: zod
				.array(
					zod.object({
						id: zod.string().min(1, EVENT_FIELD_MESSAGES.pollOptionNeedsId),
						date: zod.string().min(1, EVENT_FIELD_MESSAGES.pollOptionNeedsDate),
						time: zod.string().optional(),
						label: zod.string().max(DATE_POLL_OPTION_LABEL_LIMIT, EVENT_FIELD_MESSAGES.pollOptionLabelTooLong).optional(),
					}),
				)
				.default([]),
		})
		.optional(),
})

/**
 * Narrow, partial update of an event's presentational fields. Admin OR event owner.
 *
 * Deliberately NOT `[eventId]/update.ts`, which is a full-document replace: it writes
 * `tickets`, `images`, `capacity`, `privacy`, `timezone`, `status`, `interests` and `datePoll`
 * unconditionally, so a payload missing any of them deletes tickets, resets the timezone to
 * UTC, publishes a draft or destroys a poll and its votes. It also round-trips dates through
 * a date/time/timezone split and ticket prices through strings — every one of those
 * conversions is a data-loss bug waiting to happen if it runs on a page that was only meant
 * to edit a title.
 *
 * Here **only the keys actually sent are written**. Nothing else on the event can change, so
 * inline editing on the public page cannot reach the fields that carry money or bookings.
 *
 * Deliberately NOT accepted here, each for its own reason:
 *  - `tickets` — prices mint Stripe prices, and bookings reference ticket ids.
 *  - `slug` — changing it retires the old one and rewrites every link; that belongs with the
 *    slug field's own history handling.
 *  - `status` — publishing a draft is a workflow rather than an edit.
 *  - `showParticipants` — no UI in the manage form and `update.ts` never writes it, so accepting
 *    it here would be new behaviour rather than parity.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "PATCH") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to edit this event.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			// HostedEvents / manage.tsx call this with bare axios and read ONLY `message`, so the
			// reason has to be IN it — `data[]` never reaches their catch.
			return sendResponse(res, validation.error.errors, zodIssuesToMessage(validation.error.errors), false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
			.select("_id ownerId images videos privacy datePoll status adminApprovalStatus")
			.lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. You can only edit your own events.", false, ResCode.FORBIDDEN)
		}

		const {
			name, desc, benefits, images, videos, mediaOrder,
			location, venueName, entrance, latitude, longitude, placeId,
			timezone, startsOn, endsOn, hasStartTime, hasEndTime,
			interests, requireApproval, locationDisclosedAfterBooking, showOnMobile, premiumEvent,
			capacity, privacy, datePoll,
		} = validation.data

		const set: any = {}
		const unset: any = {}
		if (name !== undefined) set.name = name.trim()
		if (desc !== undefined) set.desc = desc
		if (benefits !== undefined) set.benefits = benefits
		if (location !== undefined) set.location = location
		// `venueName` and `entrance` are preserve-on-omit everywhere else too — a form that
		// doesn't send them must not wipe a venue name that was set by hand.
		if (venueName !== undefined) set.venueName = venueName
		if (entrance !== undefined) set.entrance = entrance
		if (timezone !== undefined) set.timezone = timezone || "UTC"
		// `update.ts` writes `interests` unconditionally, so a partial save through it wipes
		// them. Here it moves only when actually sent.
		if (interests !== undefined) set.interests = interests
		if (requireApproval !== undefined) set.requireApproval = requireApproval
		if (locationDisclosedAfterBooking !== undefined) set.locationDisclosedAfterBooking = locationDisclosedAfterBooking
		if (showOnMobile !== undefined) set.showOnMobile = showOnMobile
		if (premiumEvent !== undefined) set.premiumEvent = premiumEvent
		if (capacity !== undefined) set.capacity = capacity

		// Only written when actually sent — `update.ts` writes `privacy` unconditionally, so an
		// omitted value there lands as `undefined` over the stored one. This endpoint must not.
		if (privacy !== undefined) {
			set.privacy = privacy
			// Private events are always auto-approved. A public one needs a fresh admin review
			// only when it is NEWLY becoming public — don't re-trigger pending on an unrelated
			// edit, and don't silently approve one that is already pending. Same rule as update.ts.
			if (privacy === "private") set.adminApprovalStatus = "approved"
			else if ((event as any).privacy === "private") set.adminApprovalStatus = "pending"
		}

		// Only overwrite stored coordinates when the client actually sent new ones, i.e. the
		// user re-picked a place. Same rule as update.ts.
		if (typeof latitude === "number" && typeof longitude === "number") {
			set.coordinates = { long: longitude, lat: latitude, placeId }
		}

		// A date is `$unset` when cleared rather than written as null, so "no date" reads the
		// same way it does for an event that never had one.
		if (startsOn !== undefined) {
			if (startsOn === "") unset.startsOn = ""
			else {
				const d = new Date(startsOn)
				if (Number.isNaN(d.getTime())) {
					return sendResponse(res, null, "Invalid start date", false, ResCode.BAD_REQUEST)
				}
				set.startsOn = d
			}
		}
		if (endsOn !== undefined) {
			if (endsOn === "") unset.endsOn = ""
			else {
				const d = new Date(endsOn)
				if (Number.isNaN(d.getTime())) {
					return sendResponse(res, null, "Invalid end date", false, ResCode.BAD_REQUEST)
				}
				set.endsOn = d
			}
		}
		if (hasStartTime !== undefined) set.hasStartTime = hasStartTime
		if (hasEndTime !== undefined) set.hasEndTime = hasEndTime

		// The date poll.
		//
		// **Votes are preserved by option id.** The client never sends them: an option that
		// survives an edit keeps the votes it already collected, and only an option the host
		// actually removed loses them. `update.ts` rewrites the whole subtree from the form,
		// which is why this endpoint refused polls until now.
		//
		// Disabling is also gentler here than in `update.ts`, which writes
		// `{isActive:false, question:"", options:[]}` and destroys the votes outright. From the
		// event page a poll is one toggle away, and one click should not be able to delete what
		// guests voted for — so the options and their votes are kept and only `isActive` moves.
		if (datePoll !== undefined) {
			const storedOptions: any[] = ((event as any).datePoll?.options || []) as any[]
			const votesById = new Map<string, string[]>(storedOptions.map((o: any) => [o.id, o.votes || []]))

			if (datePoll.isActive && datePoll.options.length === 0) {
				return sendResponse(res, null, "Add at least one date option, or turn the poll off.", false, ResCode.BAD_REQUEST)
			}

			if (datePoll.isActive) {
				set.datePoll = {
					isActive: true,
					question: datePoll.question || "",
					options: datePoll.options.map((o) => ({
						id: o.id,
						date: o.date,
						time: o.time || "",
						label: o.label || "",
						votes: votesById.get(o.id) || [],
					})),
				}
				// A poll and fixed dates are mutually exclusive — the poll IS the date. Clearing
				// them here means the client can't leave the two disagreeing.
				unset.startsOn = ""
				unset.endsOn = ""
				delete set.startsOn
				delete set.endsOn
			} else {
				// Kept, votes and all, so re-enabling restores the poll as it was.
				set["datePoll.isActive"] = false
			}
		}

		// Media is three fields that only make sense together: `images` and `videos` are two
		// separate arrays and cannot express order between them, which is what `mediaOrder`
		// carries. Editing one without the others would leave the stored order naming urls
		// that no longer exist, so they move as a unit or not at all.
		const editingMedia = images !== undefined || videos !== undefined || mediaOrder !== undefined
		if (editingMedia) {
			if (images === undefined || videos === undefined || mediaOrder === undefined) {
				return sendResponse(res, null, "Send images, videos and mediaOrder together.", false, ResCode.BAD_REQUEST)
			}
			if (images.length === 0 && videos.length === 0) {
				return sendResponse(res, null, "Keep at least one photo or video.", false, ResCode.BAD_REQUEST)
			}
			// Cap for non-admin hosts, grandfathered against what is already stored so an
			// over-limit legacy event can still be trimmed or left alone — just not grown.
			const mediaRefusal = mediaLimitRefusal({
				isAdmin,
				nextCount: images.length + videos.length,
				storedCount: ((event as any).images?.length ?? 0) + ((event as any).videos?.length ?? 0),
			})
			if (mediaRefusal) return sendResponse(res, null, mediaRefusal, false, ResCode.BAD_REQUEST)
			// `mediaOrder` must name exactly what is being stored. A leftover url would render
			// nothing and a missing one would silently fall back to the legacy
			// images-then-videos order — both look like the host's arrangement was ignored.
			const stored = new Set([...images, ...videos])
			const ordered = new Set(mediaOrder)
			const consistent =
				mediaOrder.length === stored.size &&
				ordered.size === mediaOrder.length &&
				mediaOrder.every((url) => stored.has(url))
			if (!consistent) {
				return sendResponse(res, null, "The media order doesn't match the media.", false, ResCode.BAD_REQUEST)
			}
			set.images = images
			set.videos = videos
			set.mediaOrder = mediaOrder
		}

		if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
			return sendResponse(res, null, "Nothing to update", false, ResCode.BAD_REQUEST)
		}

		// A live save supersedes any autosaved shadow draft, exactly as `update.ts` does.
		// Manage Event prefers `draftRevision` over the live document, so a draft left behind by
		// an abandoned console edit would keep showing the OLD interests/images/dates to the host
		// AND to an admin — and the next "Update Event" would republish them over what was just
		// saved here.
		unset.draftRevision = ""

		const updateDoc: any = {}
		if (Object.keys(set).length > 0) updateDoc.$set = set
		if (Object.keys(unset).length > 0) updateDoc.$unset = unset

		// Capacity is mirrored on the tracker that gates checkout, approvals and the waiting
		// list. Same block as `update.ts`: no tracker means no upsert, so a legacy event without
		// one stays without one rather than gaining a gate it never had.
		if (capacity !== undefined) {
			const { EventTracker } = await import("@/models/events/event-tracker")
			const tracker = await EventTracker.findOne({ eventId: new Types.ObjectId(eventId) })
			if (tracker) {
				tracker.eventCapacity = capacity
				await tracker.save()
			}
		}

		const updated = await Events.findByIdAndUpdate(eventId, updateDoc, { new: true })
			.select("_id name desc benefits images videos mediaOrder location venueName entrance coordinates timezone startsOn endsOn hasStartTime hasEndTime interests requireApproval locationDisclosedAfterBooking showOnMobile premiumEvent capacity privacy adminApprovalStatus status slug ownerId")
			.lean()

		// Private → public from the inline editor puts a published event into the review queue.
		if (updated && !isAwaitingAdminReview(event as any) && isAwaitingAdminReview(updated as any)) {
			await notifyOwnerEventSubmitted(updated as any)
		}

		return sendResponse(res, updated, "Event updated", true, ResCode.OK)
	} catch (error: any) {
		console.error("[events/details] Error:", error)
		return sendResponse(res, null, "We couldn't save those changes. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
