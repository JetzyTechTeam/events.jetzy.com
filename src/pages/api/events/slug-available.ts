import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { escapeForRegex, validateEventSlug } from "@/lib/event-slug"

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

		// Case-insensitive, and deliberately NOT filtered by isDeleted: the unique index
		// has no partial filter, so a soft-deleted event still holds its slug.
		const query: Record<string, any> = {
			slug: { $regex: new RegExp(`^${escapeForRegex(check.slug)}$`, "i") },
		}
		if (eventId && typeof eventId === "string") query._id = { $ne: eventId }

		const existing = await Events.findOne(query).select("_id").lean()

		return sendResponse(
			res,
			existing
				? { available: false, reason: "That event URL is already taken." }
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
