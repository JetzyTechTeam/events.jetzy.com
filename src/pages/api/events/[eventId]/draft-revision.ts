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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

		let payload: any
		try {
			payload = JSON.parse(body.payload)
		} catch {
			return sendResponse(res, null, "Invalid payload.", false, ResCode.BAD_REQUEST)
		}

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
