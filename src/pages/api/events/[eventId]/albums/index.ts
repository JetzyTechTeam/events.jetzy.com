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

const mediaSchema = zod.object({
	url: zod.string().url(),
	type: zod.enum(["image", "video"]),
})

const createAlbumSchema = zod.object({
	title: zod.string().min(1).max(120),
	description: zod.string().max(2000).optional(),
	media: zod.array(mediaSchema).min(1, "Add at least one photo or video"),
	showEvents: zod.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)

		// Listing albums is public — anyone on the event page sees the photos, no prompt.
		// The name+email gate only exists for share links (it records who arrived from one).
		// Creating still requires admin/owner (checked on POST).
		const userRole = (session?.user as any)?.role
		const userId = (session?.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		const eventObjectId = new Types.ObjectId(eventId)
		const event = await Events.findOne({ _id: eventObjectId, isDeleted: false }).select("_id ownerId slug name").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// GET — list albums (public)
		if (req.method === "GET") {
			const albums = await EventAlbums.find({ eventId: eventObjectId, isDeleted: false }).sort({ createdAt: -1 }).lean()
			return sendResponse(res, albums, "Albums retrieved successfully", true, ResCode.OK)
		}

		// POST — create album (admin OR owner)
		if (req.method === "POST") {
			if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
				return sendResponse(res, null, "Access denied. Only the event owner can manage albums.", false, ResCode.FORBIDDEN)
			}

			const validation = createAlbumSchema.safeParse(req.body)
			if (!validation.success) {
				return sendResponse(res, validation.error.errors, "Invalid album data", false, ResCode.BAD_REQUEST)
			}

			const { title, description, media, showEvents } = validation.data
			const album = await EventAlbums.create({
				eventId: eventObjectId,
				title,
				description: description || "",
				media,
				showEvents,
				createdBy: userId ? new Types.ObjectId(userId) : undefined,
			})

			return sendResponse(res, album, "Album created successfully", true, ResCode.CREATED)
		}

		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	} catch (error: any) {
		console.error("[albums/index] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
