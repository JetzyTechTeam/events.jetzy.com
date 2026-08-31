import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import zod from "zod"

const schema = zod.object({
	name: zod.string().min(1).max(300).optional(),
	desc: zod.string().max(20000).optional(),
	benefits: zod.string().max(2000).optional(),
	images: zod.array(zod.string().min(1)).optional(),
	videos: zod.array(zod.string().min(1)).optional(),
	mediaOrder: zod.array(zod.string().min(1)).optional(),
	location: zod.string().max(500).optional(),
	venueName: zod.string().max(300).optional(),
	entrance: zod.string().max(200).optional(),
	latitude: zod.number().optional(),
	longitude: zod.number().optional(),
	placeId: zod.string().optional(),
	timezone: zod.string().max(100).optional(),
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
 *  - `privacy` / `status` — flipping either moves an event through admin approval or publishes
 *    a draft, which is a workflow rather than an edit.
 *  - `datePoll` — mutually exclusive with fixed dates and holds votes.
 *  - `showParticipants` — no UI in the manage form and `update.ts` never writes it, so accepting
 *    it here would be new behaviour rather than parity.
 *  - `capacity` — a change has to re-sync `EventTracker.eventCapacity`, which only `update.ts`
 *    does. Accepting it here would silently leave the tracker holding the old number, so
 *    capacity stays in Manage Event.
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
			return sendResponse(res, validation.error.errors, "Invalid event data", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
			.select("_id ownerId images videos")
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
			interests, requireApproval, locationDisclosedAfterBooking, showOnMobile,
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

		const updateDoc: any = {}
		if (Object.keys(set).length > 0) updateDoc.$set = set
		if (Object.keys(unset).length > 0) updateDoc.$unset = unset

		const updated = await Events.findByIdAndUpdate(eventId, updateDoc, { new: true })
			.select("_id name desc benefits images videos mediaOrder location venueName entrance coordinates timezone startsOn endsOn hasStartTime hasEndTime interests requireApproval locationDisclosedAfterBooking showOnMobile")
			.lean()

		return sendResponse(res, updated, "Event updated", true, ResCode.OK)
	} catch (error: any) {
		console.error("[events/details] Error:", error)
		return sendResponse(res, null, "We couldn't save those changes. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
