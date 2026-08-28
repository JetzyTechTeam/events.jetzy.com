import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventAlbums } from "@/models/events/albums"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import zod from "zod"

const schema = zod.object({
	mediaUrls: zod.array(zod.string().min(1)).min(1),
})

/**
 * Reorders an album's media. Admin OR event owner.
 *
 * Its own route rather than the existing PUT, which is a FULL REPLACE requiring title,
 * description and the whole media array. Reordering from the album page would mean sending
 * those fields back from whatever the page happened to be holding — so a stale tab could
 * revert a title, and a bug in the media round-trip could delete photos. Here the only thing
 * that can change is the order.
 *
 * The submitted list must be an exact PERMUTATION of what is stored: same length, same set of
 * urls. Anything else is refused rather than partially applied — if the album changed under
 * the person dragging (another admin added a photo), the safe outcome is "reload and try
 * again", not silently dropping whatever they hadn't seen.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "PATCH") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to manage albums.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId, albumId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!albumId || typeof albumId !== "string" || !Types.ObjectId.isValid(albumId)) {
			return sendResponse(res, null, "Valid album ID is required", false, ResCode.BAD_REQUEST)
		}

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, null, "A media order is required", false, ResCode.BAD_REQUEST)
		}

		const eventObjectId = new Types.ObjectId(eventId)
		const event = await Events.findOne({ _id: eventObjectId, isDeleted: false }).select("_id ownerId").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. Only the event owner can manage albums.", false, ResCode.FORBIDDEN)
		}

		const album = await EventAlbums.findOne({ _id: new Types.ObjectId(albumId), eventId: eventObjectId, isDeleted: false })
		if (!album) {
			return sendResponse(res, null, "Album not found", false, ResCode.NOT_FOUND)
		}

		const current = (album.media || []) as { url: string; type: string }[]
		const requested = validation.data.mediaUrls

		// Exact permutation, checked both ways. Length alone would let a duplicated url stand
		// in for a missing one and quietly drop a photo.
		const currentSet = new Set(current.map((m) => m.url))
		const requestedSet = new Set(requested)
		const isPermutation =
			requested.length === current.length &&
			requestedSet.size === requested.length &&
			currentSet.size === requestedSet.size &&
			requested.every((url) => currentSet.has(url))

		if (!isPermutation) {
			return sendResponse(
				res,
				null,
				"This album changed since you opened it. Refresh the page and try again.",
				false,
				ResCode.BAD_REQUEST,
			)
		}

		// Rebuilt from the STORED entries, so `type` and anything else on the sub-document
		// survives — the client only ever sends urls.
		const byUrl = new Map(current.map((m) => [m.url, m]))
		album.media = requested.map((url) => byUrl.get(url)) as any
		await album.save()

		return sendResponse(res, { media: album.media }, "Photo order saved", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/order] Error:", error)
		return sendResponse(res, null, "We couldn't save that order. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
