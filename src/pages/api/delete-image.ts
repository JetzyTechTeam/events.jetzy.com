import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { Types } from "mongoose"

/**
 * Removes one image url from an event. Admin OR event owner.
 *
 * This route had NO authentication of any kind and took no event id: it matched
 * `{ images: { $in: [url] } }` and pulled the url from whichever event happened to hold it, so
 * an unauthenticated POST could strip images off arbitrary events. It is now scoped to a named
 * event and gated like every other event mutation.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to edit this event.", false, ResCode.UNAUTHORIZED)
		}

		const { eventId, url } = req.body || {}
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!url || typeof url !== "string") {
			return sendResponse(res, null, "An image URL is required", false, ResCode.BAD_REQUEST)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id ownerId").lean()
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. You can only edit your own events.", false, ResCode.FORBIDDEN)
		}

		// `mediaOrder` names urls across both `images` and `videos`, so a removed image has to
		// leave it too. `eventMedia()` skips entries whose url is gone, so a leftover is invisible
		// rather than broken — but that is how the array rots.
		const result = await Events.updateOne(
			{ _id: new Types.ObjectId(eventId) },
			{ $pull: { images: url, mediaOrder: url } },
		)

		return sendResponse(res, { success: result.modifiedCount > 0 }, "Image removed", true, ResCode.OK)
	} catch (error: any) {
		console.error("[delete-image] Error:", error.message)
		return sendResponse(res, null, "We couldn't remove that image. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
