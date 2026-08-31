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

		const { name, desc, benefits, images, videos, mediaOrder } = validation.data

		const set: any = {}
		if (name !== undefined) set.name = name.trim()
		if (desc !== undefined) set.desc = desc
		if (benefits !== undefined) set.benefits = benefits

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

		if (Object.keys(set).length === 0) {
			return sendResponse(res, null, "Nothing to update", false, ResCode.BAD_REQUEST)
		}

		const updated = await Events.findByIdAndUpdate(eventId, { $set: set }, { new: true })
			.select("_id name desc benefits images videos mediaOrder")
			.lean()

		return sendResponse(res, updated, "Event updated", true, ResCode.OK)
	} catch (error: any) {
		console.error("[events/details] Error:", error)
		return sendResponse(res, null, "We couldn't save those changes. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
