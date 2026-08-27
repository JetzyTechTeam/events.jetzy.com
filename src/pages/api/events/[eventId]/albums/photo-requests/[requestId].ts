import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { AlbumPhotoRequest } from "@/models/events/album-photo-request"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import zod from "zod"

const schema = zod.object({
	status: zod.enum(["pending", "handled"]),
})

/**
 * Admin OR event owner. Marks one photo request handled (or back to pending).
 *
 * Nothing downstream reads `status` — it exists so a host working through a list knows which
 * ones they have already replied to. Sending the file is still done by hand, off-platform.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "PATCH") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId, requestId } = req.query as { eventId?: string; requestId?: string }
		if (!eventId || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!requestId || !Types.ObjectId.isValid(requestId)) {
			return sendResponse(res, null, "Valid request ID is required", false, ResCode.BAD_REQUEST)
		}

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, null, "A valid status is required", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id ownerId").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. You can only manage requests for your own events.", false, ResCode.FORBIDDEN)
		}

		const handled = validation.data.status === "handled"
		const updated = await AlbumPhotoRequest.findOneAndUpdate(
			{ _id: new Types.ObjectId(requestId), eventId: new Types.ObjectId(eventId) },
			handled
				? {
						status: "handled",
						handledAt: new Date(),
						handledBy: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
				  }
				: { status: "pending", $unset: { handledAt: "", handledBy: "" } },
			{ new: true },
		)
			.select("_id status handledAt")
			.lean()

		if (!updated) {
			return sendResponse(res, null, "Request not found", false, ResCode.NOT_FOUND)
		}

		return sendResponse(res, { _id: (updated as any)._id.toString(), status: (updated as any).status }, "Request updated", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/photo-requests/:id] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
