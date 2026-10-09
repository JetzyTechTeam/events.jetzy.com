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
import { ALBUM_DESCRIPTION_LIMIT, ALBUM_FIELD_MESSAGES, ALBUM_TITLE_LIMIT } from "@/lib/album-field-limits"

const mediaSchema = zod.object({
	url: zod.string({ required_error: ALBUM_FIELD_MESSAGES.mediaInvalid }).url(ALBUM_FIELD_MESSAGES.mediaInvalid),
	type: zod.enum(["image", "video"], { errorMap: () => ({ message: ALBUM_FIELD_MESSAGES.mediaInvalid }) }),
})

const updateAlbumSchema = zod.object({
	title: zod
		.string({ required_error: ALBUM_FIELD_MESSAGES.titleRequired })
		.min(1, ALBUM_FIELD_MESSAGES.titleRequired)
		.max(ALBUM_TITLE_LIMIT, ALBUM_FIELD_MESSAGES.titleTooLong),
	description: zod.string().max(ALBUM_DESCRIPTION_LIMIT, ALBUM_FIELD_MESSAGES.descriptionTooLong).optional(),
	media: zod
		.array(mediaSchema, { required_error: ALBUM_FIELD_MESSAGES.mediaRequired })
		.min(1, ALBUM_FIELD_MESSAGES.mediaRequired),
	showEvents: zod.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

		const eventObjectId = new Types.ObjectId(eventId)
		const event = await Events.findOne({ _id: eventObjectId, isDeleted: false }).select("_id ownerId").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Both PUT and DELETE require admin OR owner
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. Only the event owner can manage albums.", false, ResCode.FORBIDDEN)
		}

		const album = await EventAlbums.findOne({ _id: new Types.ObjectId(albumId), eventId: eventObjectId, isDeleted: false })
		if (!album) {
			return sendResponse(res, null, "Album not found", false, ResCode.NOT_FOUND)
		}

		if (req.method === "PUT") {
			const validation = updateAlbumSchema.safeParse(req.body)
			if (!validation.success) {
				// Same rule as the create route: say which field and what the limit is.
				const reason = validation.error.errors[0]?.message || ALBUM_FIELD_MESSAGES.fallback
				return sendResponse(res, validation.error.errors, reason, false, ResCode.BAD_REQUEST)
			}
			const { title, description, media, showEvents } = validation.data
			album.title = title
			album.description = description || ""
			album.media = media as any
			// Omitted means unchanged — an older client that doesn't send the field must not
			// reset an album the host has deliberately switched off.
			if (showEvents !== undefined) album.showEvents = showEvents
			await album.save()
			return sendResponse(res, album, "Album updated successfully", true, ResCode.OK)
		}

		if (req.method === "DELETE") {
			album.isDeleted = true
			await album.save()
			return sendResponse(res, null, "Album deleted successfully", true, ResCode.OK)
		}

		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	} catch (error: any) {
		console.error("[albums/[albumId]] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
