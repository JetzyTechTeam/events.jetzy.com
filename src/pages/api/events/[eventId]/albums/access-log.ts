import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventAlbums } from "@/models/events/albums"
import { AlbumAccess } from "@/models/events/album-access"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@/models/userModal"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"

// Admin OR event owner. Returns the per-viewer album access log (who logged in / signed up
// via a shared album link) so it can be shown and exported. Respects dateFrom/dateTo.
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
			return sendResponse(res, null, "Access denied. You can only view analytics for your own events.", false, ResCode.FORBIDDEN)
		}

		const eventObjectId = new Types.ObjectId(eventId)

		// Date filter over createdAt
		const match: any = { eventId: eventObjectId }
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

		const rows = await AlbumAccess.find(match).sort({ createdAt: -1 }).limit(5000).lean()

		// Resolve album titles + user name/email (users live in either EventUsers or Users)
		const albumIds = Array.from(new Set(rows.map((r) => r.albumId?.toString()).filter(Boolean)))
		const userIds = Array.from(new Set(rows.map((r) => r.userId?.toString()).filter(Boolean)))

		const [albums, eventUsers, users] = await Promise.all([
			EventAlbums.find({ _id: { $in: albumIds.map((id) => new Types.ObjectId(id)) } }).select("_id title").lean(),
			EventUsers.find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } }).select("_id firstName lastName email").lean(),
			Users.find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } }).select("_id firstName lastName email").lean(),
		])

		const albumTitle = new Map(albums.map((a: any) => [a._id.toString(), a.title]))
		const userMap = new Map<string, { name: string; email: string }>()
		;[...eventUsers, ...users].forEach((u: any) => {
			const id = u._id.toString()
			if (!userMap.has(id)) {
				userMap.set(id, { name: [u.firstName, u.lastName].filter(Boolean).join(" ") || "—", email: u.email || "—" })
			}
		})

		const items = rows.map((r: any) => {
			const u = userMap.get(r.userId?.toString()) || { name: "—", email: "—" }
			return {
				_id: r._id.toString(),
				albumId: r.albumId?.toString(),
				albumTitle: albumTitle.get(r.albumId?.toString()) || "—",
				name: u.name,
				email: u.email,
				action: r.action,
				date: r.createdAt,
			}
		})

		return sendResponse(res, { items, total: items.length }, "Album access log retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/access-log] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
