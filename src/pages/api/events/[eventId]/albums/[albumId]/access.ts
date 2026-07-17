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
import { sendAlbumAccessNotice } from "@/lib/send-grid"

// Accounts created within this window are treated as "signup" rather than "login".
const SIGNUP_WINDOW_MS = 10 * 60 * 1000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)

		if (!session) {
			return sendResponse(res, null, "You need to be logged in to view this album.", false, ResCode.UNAUTHORIZED)
		}

		const userId = (session.user as any)?._id?.toString()
		if (!userId || !Types.ObjectId.isValid(userId)) {
			return sendResponse(res, null, "Invalid session user.", false, ResCode.UNAUTHORIZED)
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
		const userObjectId = new Types.ObjectId(userId)

		const event = await Events.findOne({ _id: eventObjectId, isDeleted: false }).select("_id name slug").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const album = await EventAlbums.findOne({ _id: albumObjectId, eventId: eventObjectId, isDeleted: false }).select("_id title").lean()
		if (!album) {
			return sendResponse(res, null, "Album not found", false, ResCode.NOT_FOUND)
		}

		// Determine how the viewer authenticated (login vs fresh signup) via account age.
		let action: "login" | "signup" = "login"
		let recipientName = ((session.user as any)?.name || (session.user as any)?.fullName || "").trim()
		let recipientEmail = ((session.user as any)?.email || "").trim()
		try {
			const projection = { createdAt: 1, firstName: 1, lastName: 1, email: 1 }
			const userDoc =
				(await EventUsers.findById(userObjectId, projection).lean()) ||
				(await Users.findById(userObjectId, projection).lean())
			if (userDoc) {
				const createdAt = (userDoc as any).createdAt ? new Date((userDoc as any).createdAt).getTime() : null
				if (createdAt && Date.now() - createdAt <= SIGNUP_WINDOW_MS) action = "signup"
				if (!recipientName) recipientName = [(userDoc as any).firstName, (userDoc as any).lastName].filter(Boolean).join(" ")
				if (!recipientEmail) recipientEmail = (userDoc as any).email || ""
			}
		} catch (e) {
			console.error("[albums/access] user lookup failed:", e)
		}

		// The unique { albumId, userId } index makes this the once-per-user-per-album guard
		// AND the analytics record. First insert wins → email; duplicates are silently ignored.
		let firstAccess = false
		try {
			await AlbumAccess.create({ eventId: eventObjectId, albumId: albumObjectId, userId: userObjectId, action })
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
				recipientName: recipientName || "A viewer",
				recipientEmail: recipientEmail || "unknown",
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
