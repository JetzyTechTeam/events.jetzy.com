import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventAlbums } from "@/models/events/albums"
import { AlbumAccess } from "@/models/events/album-access"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@/models/userModal"
import { ensureDbConnected } from "@/configs/database"
import { Types } from "mongoose"
import { sendAlbumAccessNotice } from "@/lib/send-grid"
import { resolveAlbumViewer } from "@/lib/album-auth"

// Accounts created within this window are treated as "signup" rather than "login".
const SIGNUP_WINDOW_MS = 10 * 60 * 1000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

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

		const event = await Events.findOne({ _id: eventObjectId, isDeleted: false }).select("_id name slug").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const album = await EventAlbums.findOne({ _id: albumObjectId, eventId: eventObjectId, isDeleted: false }).select("_id title").lean()
		if (!album) {
			return sendResponse(res, null, "Album not found", false, ResCode.NOT_FOUND)
		}

		// How did this viewer get here? The guest gate knows whether it just created the
		// account and tells us; for logged-in sessions fall back to account age.
		let action: "login" | "signup" = req.body?.isNewAccount === true ? "signup" : "login"
		if (req.body?.isNewAccount === undefined && viewer.userId && Types.ObjectId.isValid(viewer.userId)) {
			try {
				const projection = { createdAt: 1 }
				const userObjectId = new Types.ObjectId(viewer.userId)
				const userDoc =
					(await EventUsers.findById(userObjectId, projection).lean()) ||
					(await Users.findById(userObjectId, projection).lean())
				const createdAt = (userDoc as any)?.createdAt ? new Date((userDoc as any).createdAt).getTime() : null
				if (createdAt && Date.now() - createdAt <= SIGNUP_WINDOW_MS) action = "signup"
			} catch (e) {
				console.error("[albums/access] user lookup failed:", e)
			}
		}

		// The unique { albumId, viewerEmail } index makes this the once-per-person-per-album
		// guard AND the analytics record. First insert wins → email; duplicates are ignored.
		let firstAccess = false
		try {
			await AlbumAccess.create({
				eventId: eventObjectId,
				albumId: albumObjectId,
				userId: viewer.userId && Types.ObjectId.isValid(viewer.userId) ? new Types.ObjectId(viewer.userId) : undefined,
				viewerEmail: viewer.email,
				viewerName: viewer.name,
				action,
			})
			firstAccess = true
		} catch (error: any) {
			if (error?.code === 11000) {
				firstAccess = false // already recorded — no duplicate email
			} else {
				throw error
			}
		}

		if (firstAccess) {
			// Fire-and-forget: email failure must not block the viewer.
			sendAlbumAccessNotice({
				recipientName: viewer.name || "A viewer",
				recipientEmail: viewer.email || "unknown",
				action,
				eventName: (event as any).name,
				eventSlug: (event as any).slug,
				albumTitle: (album as any).title,
				albumId: albumId,
			}).catch((e) => console.error("[albums/access] notify email failed:", e))
		}

		return sendResponse(res, { firstAccess, action }, "Access recorded", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/access] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
