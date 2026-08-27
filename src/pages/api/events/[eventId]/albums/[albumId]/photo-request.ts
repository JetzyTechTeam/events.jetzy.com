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
import { randomUUID } from "crypto"
import zod from "zod"

/**
 * Bounds one request. Not a product rule — it keeps a single submission from writing hundreds
 * of rows and building an email nobody can open.
 */
const MAX_PHOTOS_PER_REQUEST = 30

const schema = zod.object({
	// `mediaUrl` is the single-photo form kept for older clients; `mediaUrls` is what the
	// multi-select dialog sends. At least one of them has to be present.
	mediaUrl: zod.string().min(1).optional(),
	mediaUrls: zod.array(zod.string().min(1)).min(1).max(MAX_PHOTOS_PER_REQUEST).optional(),
	// Only needed when the viewer's address hasn't been proved yet — see below.
	code: zod.string().regex(/^\d{6}$/).optional(),
})

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Records a request for the unwatermarked originals of one or more album photos.
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
 *
 * Several photos write several ROWS sharing a `batchId` — the host marks off what they have
 * sent — but only ONE confirmation email and ONE inbox notice. Five emails for one click would
 * read as a fault.
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

		// Deduped: the same url twice in one submission is one request, not two rows.
		const requestedUrls = Array.from(
			new Set([...(validation.data.mediaUrls || []), ...(validation.data.mediaUrl ? [validation.data.mediaUrl] : [])]),
		)
		if (requestedUrls.length === 0) {
			return sendResponse(res, null, "Choose a photo to request.", false, ResCode.BAD_REQUEST)
		}
		if (requestedUrls.length > MAX_PHOTOS_PER_REQUEST) {
			return sendResponse(
				res,
				null,
				"Please request up to " + MAX_PHOTOS_PER_REQUEST + " photos at a time.",
				false,
				ResCode.BAD_REQUEST,
			)
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

		// Same safety model as the download proxy: every photo has to belong to THIS album.
		// All-or-nothing — a partially honoured request would leave the viewer believing they
		// asked for photos nobody recorded.
		const albumMedia = ((album as any).media || []) as { url: string; type?: "image" | "video" }[]
		if (requestedUrls.some((url) => !albumMedia.find((m) => m.url === url))) {
			return sendResponse(res, null, "One of those photos is not part of this album.", false, ResCode.BAD_REQUEST)
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
		const alreadyPending = await AlbumPhotoRequest.find({
			albumId: new Types.ObjectId(albumId),
			requesterEmail: viewer.email,
			mediaUrl: { $in: requestedUrls },
			status: "pending",
		})
			.select("mediaUrl")
			.lean()
		const pendingUrls = new Set(alreadyPending.map((r: any) => r.mediaUrl))
		const toCreate = requestedUrls.filter((url) => !pendingUrls.has(url))

		// One row per photo, sharing a batch id so the host can see they arrived together.
		// Only stamped on a real batch: on a single-photo request it would mean nothing.
		const batchId = toCreate.length > 1 ? randomUUID() : undefined
		if (toCreate.length > 0) {
			await AlbumPhotoRequest.insertMany(
				toCreate.map((url) => ({
					eventId: new Types.ObjectId(eventId),
					albumId: new Types.ObjectId(albumId),
					mediaUrl: url,
					mediaType: albumMedia.find((m) => m.url === url)?.type,
					batchId,
					userId: viewer.userId && Types.ObjectId.isValid(viewer.userId) ? new Types.ObjectId(viewer.userId) : undefined,
					requesterEmail: viewer.email,
					requesterName: viewer.name,
					verified: true,
					status: "pending",
				})),
			)
		}

		// Both sends are fire-and-forget: the request is recorded, and a mail failure must not
		// tell the visitor it wasn't. ONE email covering every photo asked for — the whole
		// submission is what the viewer thinks of as "the request".
		sendAlbumPhotoRequestReceived({
			email: viewer.email,
			eventName: (event as any).name,
			albumTitle: (album as any).title,
			mediaUrls: requestedUrls,
		}).catch((e) => console.error("photo request confirmation failed", e))

		// Only for photos that were actually newly recorded — re-asking for something already
		// pending should not put the same thing in the inbox twice.
		if (toCreate.length > 0) {
			sendAlbumPhotoRequestNotice({
				requesterName: viewer.name,
				requesterEmail: viewer.email,
				eventName: (event as any).name,
				eventSlug: (event as any).slug || eventId,
				albumTitle: (album as any).title,
				albumId,
				mediaUrls: toCreate,
			}).catch((e) => console.error("photo request notice failed", e))
		}

		return sendResponse(
			res,
			{ requested: requestedUrls.length, created: toCreate.length },
			"Request received",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[albums/photo-request] Error:", error)
		return sendResponse(res, null, "We couldn't send that request. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
