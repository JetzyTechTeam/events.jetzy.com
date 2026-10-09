// Shadow-draft ("draft 2") endpoint. Autosaves an in-progress edit of a PUBLISHED
// event into `event.draftRevision` WITHOUT touching the live fields. The live event
// only changes when the organizer presses Save/Update (which runs the normal update
// route and clears this field). DELETE discards the shadow draft.
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { Types } from "mongoose"

/**
 * A shadow draft is an in-progress edit, so it is deliberately NOT validated field by field —
 * half-typed values are the whole point, and the same `draftRevision` field is shared with the
 * mobile app. What IS checked is that the payload is a JSON object and that it is a sane size:
 * it is stored as `Mixed` on the event document, and a document has a hard 16MB ceiling, so an
 * unbounded write here could make the event itself unreadable.
 */
const DRAFT_PAYLOAD_MAX_BYTES = 512 * 1024

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	// POST saves, DELETE discards. Anything else used to fall through to the save branch — and a
	// route with no method check answers a GET, which a session cookie (SameSite=Lax) carries.
	if (req.method !== "POST" && req.method !== "DELETE") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)

	try {
		if (!session) return sendResponse(res, null, "You need to be logged in.", false, ResCode.UNAUTHORIZED)

		const { eventId } = req.query
		if (!eventId || !Types.ObjectId.isValid(eventId as string)) {
			return sendResponse(res, null, "Invalid event id.", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId as string) })
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)

		// Ownership check — admin can edit any event, user can only edit their own
		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const userId = (session.user as any)?._id?.toString()
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Forbidden. You can only edit your own events.", false, ResCode.FORBIDDEN)
		}

		// Discard the shadow draft
		if (req.method === "DELETE") {
			await Events.updateOne({ _id: event._id }, { $unset: { draftRevision: "" } })
			return sendResponse(res, null, "Draft discarded.", true, ResCode.OK)
		}

		// Save / overwrite the shadow draft (live fields untouched)
		const body = req?.body as { payload: string }
		if (!body?.payload) return sendResponse(res, null, "Missing payload.", false, ResCode.BAD_REQUEST)

		if (Buffer.byteLength(body.payload, "utf8") > DRAFT_PAYLOAD_MAX_BYTES) {
			return sendResponse(res, null, "These changes are too large to save as a draft.", false, ResCode.BAD_REQUEST)
		}

		let payload: any
		try {
			payload = JSON.parse(body.payload)
		} catch {
			return sendResponse(res, null, "Invalid payload.", false, ResCode.BAD_REQUEST)
		}

		// An object, not an array / string / null — `draftRevision.payload` is read back as the
		// seed for the manage form, which would break on anything else.
		if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
			return sendResponse(res, null, "Invalid payload.", false, ResCode.BAD_REQUEST)
		}

		// The Premium tag is admin-only, and `update.ts` already ignores it from a host. It is
		// dropped HERE as well because a draft is read back as the seed for the manage form by
		// whoever opens it next: a host's draft carrying `premiumEvent: true` would be published
		// by the first admin to press Update Event. Absent, the form falls back to the live value.
		if (!isAdmin) delete payload.premiumEvent

		const savedAt = new Date()
		// `timestamps: false`: autosaving a shadow draft does NOT change the live event, so it
		// must not move `updatedAt`. Manage Event compares the draft's `savedAt` against
		// `updatedAt` to decide whether the draft is still newer than the live document — if the
		// draft write bumped `updatedAt` too, that comparison could never tell them apart.
		await Events.updateOne({ _id: event._id }, { $set: { draftRevision: { payload, savedAt } } }, { timestamps: false })

		return sendResponse(res, { savedAt }, "Draft saved.", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
