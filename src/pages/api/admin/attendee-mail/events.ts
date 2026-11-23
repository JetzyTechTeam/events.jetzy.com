import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { requireAdminSession } from "@/lib/attendee-mail-server"
import { escapeRegExp, stripHtml } from "@/utils/text"

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
	const query: any = { isDeleted: false }
	if (search) query.name = { $regex: escapeRegExp(search), $options: "i" }

	const events = await Events.find(query)
		.select("name slug startsOn endsOn timezone location venueName description privacy status datePoll.isActive")
		.sort({ startsOn: -1, createdAt: -1 })
		.limit(50)
		.lean()

	const items = (events as any[]).map((e) => ({
		_id: String(e._id),
		name: stripHtml(e.name || "") || "Untitled event",
		slug: e.slug || "",
		startsOn: e.startsOn || null,
		endsOn: e.endsOn || null,
		timezone: e.timezone || "",
		location: e.location || e.venueName || "",
		// A short plain-text excerpt for the prefilled email body; the admin edits from there.
		summary: stripHtml(e.description || "").replace(/\s+/g, " ").slice(0, 400),
		privacy: e.privacy || "public",
		status: e.status || "",
		datePoll: !!e.datePoll?.isActive,
	}))

	return res.status(200).json({ data: items })
}
