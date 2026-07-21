import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { AlbumInterest } from "@/models/events/album-interest"
import { ensureDbConnected } from "@/configs/database"
import { Types } from "mongoose"
import zod from "zod"
import { resolveAlbumViewer } from "@/lib/album-auth"

const schema = zod.object({
	interests: zod.array(zod.string().max(60)).max(50).optional(),
	customInterests: zod.array(zod.string().max(200)).max(50).optional(),
	optOut: zod.boolean().optional(),
})

/**
 * Save interests for the CURRENT viewer on this event.
 *
 * The name+email dialog (guest-access) only appears for unidentified visitors, so anyone
 * who arrives already logged in — notably recipients of the publish email, which signs
 * them in via a magic link — would never be asked. This endpoint lets the client collect
 * interests from those viewers too, once per event.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()

		const viewer = await resolveAlbumViewer(req, res)
		if (!viewer) {
			return sendResponse(res, null, "Enter your name and email first.", false, ResCode.UNAUTHORIZED)
		}

		const { eventId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, validation.error.errors, "Invalid interests", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const interests = validation.data.interests?.map((i) => i.trim()).filter(Boolean) || []
		const customInterests = validation.data.customInterests?.map((i) => i.trim()).filter(Boolean) || []
		const optOut = validation.data.optOut === true
		// Opting out of future events is a valid answer on its own.
		if (interests.length === 0 && customInterests.length === 0 && !optOut) {
			return sendResponse(res, null, "Select at least one interest", false, ResCode.BAD_REQUEST)
		}

		await AlbumInterest.updateOne(
			{ eventId: new Types.ObjectId(eventId), email: viewer.email },
			{
				$set: {
					name: viewer.name,
					userId: viewer.userId && Types.ObjectId.isValid(viewer.userId) ? new Types.ObjectId(viewer.userId) : undefined,
					interests,
					customInterests,
					optOut,
				},
				// Clear the legacy single field on any fresh write so it can't linger.
				$unset: { customInterest: "" },
			},
			{ upsert: true },
		)

		return sendResponse(res, { saved: true }, "Interests saved", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/my-interests] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
