import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventAlbums } from "@/models/events/albums"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import { getEventParticipants } from "@/lib/event-participants"
import { sendAlbumPublishedNotification } from "@/lib/send-grid"
import { generateMagicToken } from "@/lib/magicLink"

/**
 * Publish an album — emails everyone registered for the event that the photos are up.
 * Albums are already visible before this; publishing is purely the announcement.
 * Admin OR event owner only.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to publish an album.", false, ResCode.UNAUTHORIZED)
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
		const event = await Events.findOne({ _id: eventObjectId, isDeleted: false }).select("_id name slug ownerId").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. Only the event owner can publish albums.", false, ResCode.FORBIDDEN)
		}

		const album = await EventAlbums.findOne({ _id: new Types.ObjectId(albumId), eventId: eventObjectId, isDeleted: false })
		if (!album) {
			return sendResponse(res, null, "Album not found", false, ResCode.NOT_FOUND)
		}

		// Guard against a stray second click re-blasting every attendee.
		if (album.publishNotifiedAt && req.body?.resend !== true) {
			return sendResponse(
				res,
				{ alreadyNotified: true, publishNotifiedAt: album.publishNotifiedAt, notifiedCount: album.notifiedCount ?? 0 },
				"This album was already published. Re-send to notify attendees again.",
				false,
				ResCode.BAD_REQUEST,
			)
		}

		// Confirmed bookings + accepted invitations
		const participants = await getEventParticipants(eventId)

		const coverUrl = (album.media || []).find((m: any) => m.type === "image")?.url || (album.media || [])[0]?.url

		let sent = 0
		await Promise.all(
			Array.from(participants.entries()).map(async ([email, name]) => {
				try {
					// One-click sign-in: these are known participants and the link goes to
					// their own inbox, so they land in the album without the name+email gate.
					const fullName = (name || "").trim()
					const magicToken = generateMagicToken({
						email,
						firstName: fullName.split(" ")[0] || fullName,
						lastName: fullName.split(" ").slice(1).join(" "),
					})

					await sendAlbumPublishedNotification({
						recipientEmail: email,
						recipientName: name || "there",
						eventName: (event as any).name,
						eventSlug: (event as any).slug,
						albumTitle: album.title,
						albumId,
						coverUrl,
						magicToken,
					})
					sent += 1
				} catch (e) {
					console.error(`[albums/publish] email failed for ${email}:`, e)
				}
			}),
		)

		const now = new Date()
		album.publishedAt = album.publishedAt || now
		album.publishNotifiedAt = now
		album.notifiedCount = sent
		await album.save()

		return sendResponse(
			res,
			{ notifiedCount: sent, recipientCount: participants.size, publishedAt: album.publishedAt, publishNotifiedAt: album.publishNotifiedAt },
			sent > 0 ? `Album published — ${sent} attendee(s) notified.` : "Album published. No attendees to notify yet.",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[albums/publish] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
