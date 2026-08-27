import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { EventAlbums } from "@/models/events/albums"
import { AlbumView } from "@/models/events/album-view"
import { ensureDbConnected } from "@/configs/database"
import { clientKey, isRateLimited } from "@/lib/rate-limit"
import { Types } from "mongoose"
import zod from "zod"

const schema = zod.object({
	anonId: zod.string().min(1).max(64),
	sessionId: zod.string().max(64).optional(),
	stage: zod.enum(["landed", "gate_shown", "code_sent", "identified"]),
	email: zod.string().email().optional(),
})

// Generous: this fires on page loads, and a shared wifi is a normal case. Still bounded so the
// endpoint can't be used to write unlimited rows.
const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Records where a visitor got to on an album page. **Anonymous by design** — no session, no
 * cookie, no email required.
 *
 * `AlbumAccess` is written only after somebody is through the gate, so the people who landed
 * and gave up at the name+email dialog left no trace at all. This is what makes them countable,
 * which is the whole point: a host needs to know how many were lost at the door, not only who
 * came in.
 *
 * Stages are recorded with `$min`, so the EARLIEST time wins and a return visit can't rewrite
 * when this person first got through.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { eventId, albumId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!albumId || typeof albumId !== "string" || !Types.ObjectId.isValid(albumId)) {
			return sendResponse(res, null, "Valid album ID is required", false, ResCode.BAD_REQUEST)
		}

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, null, "Invalid tracking payload", false, ResCode.BAD_REQUEST)
		}

		if (isRateLimited(`album-view:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
			// Silently accepted: a dropped analytics ping must never surface to the visitor.
			return sendResponse(res, null, "Recorded", true, ResCode.OK)
		}

		await ensureDbConnected()

		// The album has to exist, so a stray id can't seed rows for nothing. Not gated on
		// `isDeleted` beyond this — a host deleting an album shouldn't erase its history.
		const album = await EventAlbums.findOne({ _id: new Types.ObjectId(albumId), eventId: new Types.ObjectId(eventId) })
			.select("_id")
			.lean()
		if (!album) {
			return sendResponse(res, null, "Album not found", false, ResCode.NOT_FOUND)
		}

		const { anonId, sessionId, stage, email } = validation.data
		const now = new Date()

		const update: any = { $setOnInsert: { eventId: new Types.ObjectId(eventId), albumId: new Types.ObjectId(albumId), anonId } }
		if (sessionId) update.$set = { ...(update.$set || {}), sessionId }

		if (stage === "landed") {
			update.$inc = { views: 1 }
			update.$min = { landedAt: now }
		} else if (stage === "gate_shown") {
			update.$min = { gateShownAt: now }
		} else if (stage === "code_sent") {
			update.$min = { codeSentAt: now }
		} else {
			update.$min = { identifiedAt: now }
			if (email) update.$set = { ...(update.$set || {}), viewerEmail: email.trim().toLowerCase() }
		}

		await AlbumView.updateOne({ albumId: new Types.ObjectId(albumId), anonId }, update, { upsert: true })

		return sendResponse(res, null, "Recorded", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/view] Error:", error)
		// Never fail loudly: this is instrumentation on a page the visitor came to look at.
		return sendResponse(res, null, "Recorded", true, ResCode.OK)
	}
}
