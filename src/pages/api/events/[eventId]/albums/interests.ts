import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { AlbumInterest } from "@/models/events/album-interest"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"

// Admin OR event owner. Returns the interests viewers picked in the album access dialog —
// a per-viewer log plus a top-interests roll-up for event planning. Respects dateFrom/dateTo.
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

		const rows = await AlbumInterest.find(match).sort({ createdAt: -1 }).limit(5000).lean()

		// Resolve custom entries: new array field, falling back to the legacy single string
		// for rows captured before multi-custom.
		const customsOf = (r: any): string[] =>
			Array.isArray(r.customInterests) && r.customInterests.length
				? r.customInterests
				: r.customInterest
				? [r.customInterest]
				: []

		// Per-viewer log
		const items = rows.map((r: any) => ({
			_id: r._id.toString(),
			name: r.name || "—",
			email: r.email || "—",
			interests: Array.isArray(r.interests) ? r.interests : [],
			customInterests: customsOf(r),
			date: r.createdAt,
		}))

		// Top interests roll-up (chip picks + custom write-ins together, custom labelled)
		const counts = new Map<string, number>()
		for (const r of rows as any[]) {
			for (const i of r.interests || []) {
				const key = String(i).trim()
				if (key) counts.set(key, (counts.get(key) || 0) + 1)
			}
			for (const c of customsOf(r)) {
				const custom = String(c).trim()
				if (custom) counts.set(`${custom} (custom)`, (counts.get(`${custom} (custom)`) || 0) + 1)
			}
		}
		const top = Array.from(counts.entries())
			.map(([interest, count]) => ({ interest, count }))
			.sort((a, b) => b.count - a.count)

		return sendResponse(res, { items, total: items.length, top }, "Album interests retrieved successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/interests] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
