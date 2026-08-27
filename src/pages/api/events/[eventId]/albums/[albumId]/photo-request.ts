import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventAlbums } from "@/models/events/albums"
import { AlbumPhotoRequest } from "@/models/events/album-photo-request"
import { ensureDbConnected } from "@/configs/database"
import { resolveAlbumViewer } from "@/lib/album-auth"
import { consumeAlbumCode, consumeFailureMessage } from "@/lib/album-verification"
import { sendAlbumPhotoRequestNotice, sendAlbumPhotoRequestReceived } from "@/lib/send-grid"
import { clientKey, isRateLimited } from "@/lib/rate-limit"
import { Types } from "mongoose"
import zod from "zod"

const schema = zod.object({
	mediaUrl: zod.string().min(1),
	// Only needed when the viewer's address hasn't been proved yet — see below.
	code: zod.string().regex(/^\d{6}$/).optional(),
})

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Records a request for the unwatermarked original of ONE album photo.
 *
 * Identity, and why there is no email field:
 *
 * Getting this far already means passing the album gate, so `resolveAlbumViewer` always knows
 * the address — taking one from the body would let anyone file a request under someone else's
 * name. A viewer whose address is already PROVED (`verified === true`: a NextAuth session, or
 * a guest who passed the 6-digit code at the gate minutes ago) is not asked for a second code
 * for the same address. Only legacy guest cookies, minted before the code gate existed, carry
 * `verified: undefined` — those still have to prove it here, which is what `code` is for.
 *
 * Nothing about what the CDN serves changes here. This is a log the host reads in the manage
 * console; the confirmation email promises a reply, not a file.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()

		const { eventId, albumId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!albumId || typeof albumId !== "string" || !Types.ObjectId.isValid(albumId)) {
			return sendResponse(res, null, "Valid album ID is required", false, ResCode.BAD_REQUEST)
		}

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, null, "Choose a photo to request.", false, ResCode.BAD_REQUEST)
		}

		if (isRateLimited(`album-photo-request:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
			return sendResponse(res, null, "Too many requests. Please slow down.", false, ResCode.TOO_MANY_REQUESTS)
		}

		const viewer = await resolveAlbumViewer(req, res)
		if (!viewer) {
			return sendResponse(res, null, "Enter your name and email to view this album.", false, ResCode.UNAUTHORIZED)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id name slug").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const album = await EventAlbums.findOne({
			_id: new Types.ObjectId(albumId),
			eventId: new Types.ObjectId(eventId),
			isDeleted: false,
		})
			.select("_id title media")
			.lean()
		if (!album) {
			return sendResponse(res, null, "Album not found", false, ResCode.NOT_FOUND)
		}

		// Same safety model as the download proxy: the photo has to belong to THIS album.
		const item = ((album as any).media || []).find((m: any) => m.url === validation.data.mediaUrl)
		if (!item) {
			return sendResponse(res, null, "That photo is not part of this album.", false, ResCode.BAD_REQUEST)
		}

		// Unverified (legacy cookie) viewers prove the address before anything is written —
		// the same order the album gate itself uses.
		if (viewer.verified !== true) {
			if (!validation.data.code) {
				return sendResponse(res, { needsVerification: true, email: viewer.email }, "Verify your email to send this request.", false, ResCode.BAD_REQUEST)
			}
			const result = await consumeAlbumCode(eventId, viewer.email, validation.data.code)
			if (!result.ok) {
				return sendResponse(res, { needsVerification: true, email: viewer.email }, consumeFailureMessage(result.reason), false, ResCode.BAD_REQUEST)
			}
		}

		// Advisory dedupe, not an index: asking again after being ignored is legitimate, but
		// double-clicking the button should not open two rows for the host to work through.
		const existing = await AlbumPhotoRequest.findOne({
			albumId: new Types.ObjectId(albumId),
			requesterEmail: viewer.email,
			mediaUrl: validation.data.mediaUrl,
			status: "pending",
		})
			.select("_id")
			.lean()

		if (!existing) {
			await AlbumPhotoRequest.create({
				eventId: new Types.ObjectId(eventId),
				albumId: new Types.ObjectId(albumId),
				mediaUrl: validation.data.mediaUrl,
				mediaType: item.type,
				userId: viewer.userId && Types.ObjectId.isValid(viewer.userId) ? new Types.ObjectId(viewer.userId) : undefined,
				requesterEmail: viewer.email,
				requesterName: viewer.name,
				verified: true,
				status: "pending",
			})
		}

		// Both sends are fire-and-forget: the request is recorded, and a mail failure must not
		// tell the visitor it wasn't.
		sendAlbumPhotoRequestReceived({
			email: viewer.email,
			eventName: (event as any).name,
			albumTitle: (album as any).title,
			mediaUrl: validation.data.mediaUrl,
		}).catch((e) => console.error("photo request confirmation failed", e))

		if (!existing) {
			sendAlbumPhotoRequestNotice({
				requesterName: viewer.name,
				requesterEmail: viewer.email,
				eventName: (event as any).name,
				eventSlug: (event as any).slug || eventId,
				albumTitle: (album as any).title,
				albumId,
				mediaUrl: validation.data.mediaUrl,
			}).catch((e) => console.error("photo request notice failed", e))
		}

		return sendResponse(res, { alreadyRequested: !!existing }, "Request received", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/photo-request] Error:", error)
		return sendResponse(res, null, "We couldn't send that request. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
