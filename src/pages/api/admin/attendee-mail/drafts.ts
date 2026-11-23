import type { NextApiRequest, NextApiResponse } from "next"
import { Types } from "mongoose"
import { ensureDbConnected } from "@/configs/database"
import { AttendeeMailings } from "@/models/admin/attendee-mailings"
import { parseDraftBody, requireAdminSession } from "@/lib/attendee-mail-server"

/**
 * POST /api/admin/attendee-mail/drafts — admin only. Saves a NEW draft and returns its id; later
 * saves of the same draft go to PUT /api/admin/attendee-mail/[id].
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
	await ensureDbConnected()
	const session = await requireAdminSession(req, res)
	if (!session) return

	const parsed = await parseDraftBody(req.body)
	if ("error" in parsed) return res.status(400).json({ error: parsed.error })

	const userId = (session.user as any)?._id?.toString()
	const email = (session.user as any)?.email
	const by = userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined
	const draft = await AttendeeMailings.create({
		status: "draft",
		...parsed.fields,
		createdBy: by,
		createdByEmail: email,
		updatedBy: by,
		updatedByEmail: email,
	})
	return res.status(201).json({ data: { _id: String(draft._id), updatedAt: draft.updatedAt } })
}
