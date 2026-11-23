import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventAlbums } from "@/models/events/albums"
import { AlbumTags } from "@/models/events/album-tags"
import { ensureDbConnected } from "@/configs/database"
import { Types } from "mongoose"
import zod from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { resolveAlbumViewer } from "@/lib/album-auth"
import { sendAlbumTagNotification } from "@/lib/send-grid"
import { tagForViewer } from "@/lib/album-tag-visibility"

const createTagSchema = zod.object({
	mediaUrl: zod.string().url(),
	personEmail: zod.string().email(),
	personName: zod.string().max(120).optional(),
})

// Album covers are public, but the photos themselves are not: opening an album needs an
// identified viewer (a session, or the name+email guest gate). Tags carry personal email
// addresses, so both reading and writing them stay behind that gate — and even behind it,
// only the event's admin/owner read the addresses (see album-tag-visibility.ts).
//
// Creating a tag emails somebody in the viewer's name, so it needs a real SESSION: the guest
// cookie is enough to look, not to tag. The page already hid the button from cookie viewers;
// the route enforces it, or a direct call could still send the email.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		await ensureDbConnected()

		const viewer = await resolveAlbumViewer(req, res)
		if (!viewer) {
			return sendResponse(res, null, "Enter your name and email to view this album.", false, ResCode.UNAUTHORIZED)
		}

		const { eventId, albumId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!albumId || typeof albumId !== "string" || !Types.ObjectId.isValid(albumId)) {
			return sendResponse(res, null, "Valid album ID is required", false, ResCode.BAD_REQUEST)
		}

		const eventObjectId = new Types.ObjectId(eventId)
		const albumObjectId = new Types.ObjectId(albumId)

		const event = await Events.findOne({ _id: eventObjectId, isDeleted: false }).select("_id name slug ownerId").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const album = await EventAlbums.findOne({ _id: albumObjectId, eventId: eventObjectId, isDeleted: false }).select("_id title media").lean()
		if (!album) {
			return sendResponse(res, null, "Album not found", false, ResCode.NOT_FOUND)
		}

		// GET — all tags for this album, so the gallery can render them per photo. Addresses are
		// masked unless the viewer runs the event (or the address is their own).
		if (req.method === "GET") {
			const tags = await AlbumTags.find({ albumId: albumObjectId }).sort({ createdAt: 1 }).lean()
			const session = await getServerSession(req, res, authOptions)
			const userRole = (session?.user as any)?.role
			const userId = (session?.user as any)?._id?.toString()
			const canManage =
				userRole === "admin" || userRole === "super admin" || (!!userId && (event as any).ownerId?.toString() === userId)
			const visible = tags.map((tag) => tagForViewer(tag as any, viewer.email, canManage))
			return sendResponse(res, visible, "Tags retrieved successfully", true, ResCode.OK)
		}

		// POST — tag someone in a photo, then email them
		if (req.method === "POST") {
			if (viewer.isGuest) {
				return sendResponse(res, null, "Please sign in to tag people in photos.", false, ResCode.UNAUTHORIZED)
			}

			const validation = createTagSchema.safeParse(req.body)
			if (!validation.success) {
				return sendResponse(res, validation.error.errors, "Invalid tag data", false, ResCode.BAD_REQUEST)
			}

			const { mediaUrl, personEmail, personName } = validation.data

			// The photo must actually belong to this album.
			const belongs = ((album as any).media || []).some((m: any) => m.url === mediaUrl)
			if (!belongs) {
				return sendResponse(res, null, "That photo is not part of this album.", false, ResCode.BAD_REQUEST)
			}

			const email = personEmail.trim().toLowerCase()

			// Re-tagging is allowed: the same person can be tagged more than once on a
			// photo and is emailed each time (no dedupe — the index is not unique).
			const tag = await AlbumTags.create({
				eventId: eventObjectId,
				albumId: albumObjectId,
				mediaUrl,
				personEmail: email,
				personName: personName?.trim(),
				taggedByEmail: viewer.email,
				taggedByName: viewer.name,
				notifiedAt: new Date(),
			})

			// Fire-and-forget: a failed email must not fail the tag.
			sendAlbumTagNotification({
				recipientEmail: email,
				recipientName: personName?.trim() || "there",
				taggerName: viewer.name || "Someone",
				eventName: (event as any).name,
				eventSlug: (event as any).slug,
				albumTitle: (album as any).title,
				albumId,
				mediaUrl,
			}).catch((e) => console.error("[albums/tags] notify email failed:", e))

			return sendResponse(res, { tag, isNew: true }, "Person tagged", true, ResCode.CREATED)
		}

		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	} catch (error: any) {
		console.error("[albums/tags] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
