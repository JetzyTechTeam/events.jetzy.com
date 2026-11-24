import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { collectAttendees, parseEventIds, parseGroups, requireAdminSession } from "@/lib/attendee-mail-server"

/**
 * GET /api/admin/attendee-mail/recipients?eventIds=a,b&groups=booked,pending,invited — admin only.
 *
 * The people behind the picked events, one row per address, with where each came from.
 * See `collectAttendees` for what each group means.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
	await ensureDbConnected()
	const session = await requireAdminSession(req, res)
	if (!session) return

	const eventIds = parseEventIds(req.query.eventIds)
	const groups = parseGroups(req.query.groups)
	if (eventIds.length > 50) return res.status(400).json({ error: "Pick at most 50 events at once." })

	const attendees = await collectAttendees(eventIds, groups)
	return res.status(200).json({ data: attendees })
}
