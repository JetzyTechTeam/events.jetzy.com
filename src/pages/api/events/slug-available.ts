import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { slugTakenFilter, validateEventSlug } from "@/lib/event-slug"

/**
 * Live "is this event URL free?" check for the create/manage forms.
 *
 * GET /api/events/slug-available?slug=my-event&eventId=<optional current event>
 *   -> { available: boolean, reason?: string }
 *
 * Login required — this reveals whether a given slug exists, which shouldn't be
 * probeable anonymously.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
	}

	const session = await getServerSession(req, res, authOptions)
	if (!session) return sendResponse(res, null, "Not authenticated.", false, ResCode.UNAUTHORIZED)

	const { slug, eventId } = req.query
	if (!slug || typeof slug !== "string") {
		return sendResponse(res, null, "A slug is required.", false, ResCode.BAD_REQUEST)
	}

	const check = validateEventSlug(slug)
	if (!check.ok) {
		return sendResponse(res, { available: false, reason: check.reason }, check.reason, true, ResCode.OK)
	}

	try {
		await ensureDbConnected()

		// Must use the exact same filter as `buildUniqueSlug`, or this reports "available"
		// and the save then silently uniquifies to "-2". That means matching former slugs
		// too: they still have live redirects pointing at them.
		const query: Record<string, any> = slugTakenFilter(check.slug)
		if (eventId && typeof eventId === "string") query._id = { $ne: eventId }

		const existing = await Events.findOne(query).select("_id slug").lean()

		// Distinguish the two so the host isn't told a url is taken by an event they can
		// see nothing of at that address.
		const takenByAlias = !!existing && existing.slug?.toLowerCase() !== check.slug.toLowerCase()

		return sendResponse(
			res,
			existing
				? {
						available: false,
						reason: takenByAlias
							? "That URL previously belonged to another event and still redirects to it."
							: "That event URL is already taken.",
				  }
				: { available: true },
			"ok",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[events/slug-available] error:", error?.message || error)
		return sendResponse(res, null, "Could not check that URL.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
