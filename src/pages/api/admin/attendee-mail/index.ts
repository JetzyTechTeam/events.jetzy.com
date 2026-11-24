import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { AttendeeMailings } from "@/models/admin/attendee-mailings"
import { requireAdminSession } from "@/lib/attendee-mail-server"

/**
 * GET /api/admin/attendee-mail?status=sent|draft — admin only.
 *
 * The page's two lists. Counts only — `recipients` (and a draft's people lists) can be thousands of
 * entries and the list shows a line per email; the detail route serves them.
 * A sent row has NO `status` (rows written before drafts existed), so "sent" means `$ne: "draft"`.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
	await ensureDbConnected()
	const session = await requireAdminSession(req, res)
	if (!session) return

	const drafts = req.query.status === "draft"
	const rows = await AttendeeMailings.find(drafts ? { status: "draft" } : { status: { $ne: "draft" } })
		.select("-recipients -extraPeople -excludedEmails -message")
		.sort(drafts ? { updatedAt: -1 } : { sentAt: -1 })
		.limit(50)
		.lean()
	return res.status(200).json({ data: rows })
}
