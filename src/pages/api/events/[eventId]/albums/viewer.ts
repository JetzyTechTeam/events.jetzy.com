import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { resolveAlbumViewer } from "@/lib/album-auth"
import { AlbumInterest } from "@/models/events/album-interest"
import { Types } from "mongoose"

/**
 * Who is viewing, if anyone? Returns { identified: false } rather than a 401 — being
 * anonymous is a perfectly normal state now that albums are public.
 *
 * The client uses this to decide whether it already knows the visitor (session or guest
 * cookie), and whether we still need to ask them for interests on this event — viewers who
 * arrive already logged in (e.g. from the publish email) never see the name+email dialog,
 * so they'd otherwise never be asked.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const viewer = await resolveAlbumViewer(req, res)

		if (!viewer) {
			return sendResponse(res, { identified: false, hasInterests: false }, "Anonymous viewer", true, ResCode.OK)
		}

		// Do we already have interests from this person for this event?
		let hasInterests = false
		const { eventId } = req.query
		if (typeof eventId === "string" && Types.ObjectId.isValid(eventId)) {
			const row = await AlbumInterest.findOne({ eventId: new Types.ObjectId(eventId), email: viewer.email })
				.select("interests customInterests customInterest optOut")
				.lean()
			const r = row as any
			// Opting out counts as answered — don't keep asking someone who said no thanks.
			hasInterests = !!r && ((r.interests?.length || 0) > 0 || (r.customInterests?.length || 0) > 0 || !!r.customInterest || r.optOut === true)
		}

		return sendResponse(
			res,
			{
				identified: true,
				email: viewer.email,
				name: viewer.name,
				isGuest: viewer.isGuest,
				hasInterests,
				// UNDEFINED for guest cookies minted before the code gate — those people were never
				// asked. The unwatermarked-photo request reads this to decide whether it still has
				// to prove the address, so it must not be flattened to false here.
				verified: viewer.verified,
			},
			"Viewer resolved",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[albums/viewer] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
