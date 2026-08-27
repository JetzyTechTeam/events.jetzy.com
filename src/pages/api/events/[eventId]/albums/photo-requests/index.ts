import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventAlbums } from "@/models/events/albums"
import { AlbumPhotoRequest } from "@/models/events/album-photo-request"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"

/**
 * Admin OR event owner. Lists the unwatermarked-photo requests for one event, newest first,
 * with the album title and the requested media resolved so the host's table can show the
 * actual thumbnail rather than a URL.
 *
 * Capped like the other album reports (access-log, interests) — the client paginates and
 * exports what it has; there is no server-side CSV here.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
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

		const { eventId, dateFrom, dateTo } = req.query as { eventId?: string; dateFrom?: string; dateTo?: string }
		if (!eventId || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id ownerId").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. You can only view requests for your own events.", false, ResCode.FORBIDDEN)
		}

		const match: any = { eventId: new Types.ObjectId(eventId) }
		const dateFilter: any = {}
		if (dateFrom) {
			const from = new Date(dateFrom)
			from.setHours(0, 0, 0, 0)
			dateFilter.$gte = from
		}
		if (dateTo) {
			const to = new Date(dateTo)
			to.setHours(23, 59, 59, 999)
			dateFilter.$lte = to
		}
		if (Object.keys(dateFilter).length > 0) match.createdAt = dateFilter

		const rows = await AlbumPhotoRequest.find(match).sort({ createdAt: -1 }).limit(5000).lean()

		const albumIds = Array.from(new Set(rows.map((r: any) => r.albumId?.toString()).filter(Boolean)))
		const albums = await EventAlbums.find({ _id: { $in: albumIds.map((id) => new Types.ObjectId(id)) } })
			.select("_id title")
			.lean()
		const albumTitle = new Map(albums.map((a: any) => [a._id.toString(), a.title]))

		const items = rows.map((r: any) => ({
			_id: r._id.toString(),
			albumId: r.albumId?.toString(),
			albumTitle: albumTitle.get(r.albumId?.toString()) || "—",
			mediaUrl: r.mediaUrl,
			mediaType: r.mediaType || "image",
			name: r.requesterName || "—",
			email: r.requesterEmail || "—",
			verified: r.verified === true,
			status: r.status === "handled" ? "handled" : "pending",
			handledAt: r.handledAt || null,
			date: r.createdAt,
		}))

		return sendResponse(res, { items, total: items.length }, "Photo requests retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/photo-requests] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
