import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { EventAlbums } from "@/models/events/albums"
import { ensureDbConnected } from "@/configs/database"
import { Types } from "mongoose"
import { Readable } from "stream"

// Streaming a file (possibly a large video) — don't let Next cap the response.
export const config = { api: { responseLimit: false } }

/**
 * Forces a download of an album media file.
 *
 * The media CDN doesn't send CORS headers, so the browser can't fetch→blob it cross-origin,
 * and the `download` attribute is ignored for a cross-origin href. So we proxy same-origin
 * and set Content-Disposition: attachment.
 *
 * Safety: we only ever proxy a URL that is actually part of THIS album (checked against the
 * stored media), so this can't be turned into an open proxy for arbitrary hosts. The media
 * is already publicly served by the CDN, so nothing new is exposed.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()

		const { eventId, albumId, url } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!albumId || typeof albumId !== "string" || !Types.ObjectId.isValid(albumId)) {
			return sendResponse(res, null, "Valid album ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!url || typeof url !== "string") {
			return sendResponse(res, null, "A media URL is required", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const album = await EventAlbums.findOne({ _id: new Types.ObjectId(albumId), eventId: new Types.ObjectId(eventId), isDeleted: false })
			.select("media")
			.lean()
		if (!album) {
			return sendResponse(res, null, "Album not found", false, ResCode.NOT_FOUND)
		}

		// The whole safety model: only proxy media that belongs to this album.
		const item = ((album as any).media || []).find((m: any) => m.url === url)
		if (!item) {
			return sendResponse(res, null, "That file is not part of this album.", false, ResCode.BAD_REQUEST)
		}

		const upstream = await fetch(url)
		if (!upstream.ok || !upstream.body) {
			return sendResponse(res, null, "Could not fetch the file.", false, ResCode.INTERNAL_SERVER_ERROR)
		}

		// Filename from the URL's last segment, sanitised; sensible default by type.
		const rawName = url.split("/").pop()?.split("?")[0] || ""
		const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_") || (item.type === "video" ? "video.mp4" : "photo.jpg")

		res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream")
		const len = upstream.headers.get("content-length")
		if (len) res.setHeader("Content-Length", len)
		res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`)
		res.setHeader("Cache-Control", "private, max-age=0")

		// Stream rather than buffer — large videos must not sit in memory.
		Readable.fromWeb(upstream.body as any).pipe(res)
	} catch (error: any) {
		console.error("[albums/download] Error:", error)
		if (!res.headersSent) {
			return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
		}
		res.end()
	}
}
