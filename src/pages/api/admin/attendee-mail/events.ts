import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { EVENT_OPTION_FIELDS, requireAdminSession, toEventOption } from "@/lib/attendee-mail-server"
import { escapeRegExp } from "@/utils/text"

/**
 * GET /api/admin/attendee-mail/events?search= — admin only.
 *
 * The event pickers on the Email Attendees page: every non-deleted event, past included (the people
 * worth telling about a new event are the ones who came to an old one), newest first. Light fields
 * only, plus what the "new event" picker needs to prefill the email.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
	await ensureDbConnected()
	const session = await requireAdminSession(req, res)
	if (!session) return

	const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : ""
	// No DRAFT events in either picker — a draft isn't live, so it has no attendees worth mailing
	// and nothing to link to. `$ne`, not `"published"`: events from before the field have no status.
	const query: any = { isDeleted: false, status: { $ne: "draft" } }
	if (search) query.name = { $regex: escapeRegExp(search), $options: "i" }

	const events = await Events.find(query).select(EVENT_OPTION_FIELDS).sort({ startsOn: -1, createdAt: -1 }).limit(50).lean()
	const items = (events as any[]).map(toEventOption)

	return res.status(200).json({ data: items })
}
