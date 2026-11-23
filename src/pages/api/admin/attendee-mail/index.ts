import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { AttendeeMailings } from "@/models/admin/attendee-mailings"
import { requireAdminSession } from "@/lib/attendee-mail-server"

/**
 * GET /api/admin/attendee-mail — admin only. The last 20 mailings for the page's "Sent" list,
 * with each one's recipient outcomes (so "who didn't get it" needs no second request).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
	await ensureDbConnected()
	const session = await requireAdminSession(req, res)
	if (!session) return

	const mailings = await AttendeeMailings.find({}).sort({ sentAt: -1 }).limit(20).lean()
	return res.status(200).json({ data: mailings })
}
