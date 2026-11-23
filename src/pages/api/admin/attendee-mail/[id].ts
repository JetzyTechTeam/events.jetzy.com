import type { NextApiRequest, NextApiResponse } from "next"
import { Types } from "mongoose"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { AttendeeMailings } from "@/models/admin/attendee-mailings"
import { EVENT_OPTION_FIELDS, parseDraftBody, requireAdminSession, toEventOption } from "@/lib/attendee-mail-server"

/**
 * /api/admin/attendee-mail/[id] — admin only.
 *
 *   GET    the full record (recipients, a draft's people lists), plus the source events and the
 *          linked event resolved into picker shape so the page can show and reload them.
 *   PUT    save over a DRAFT. A sent email is history: 409.
 *   DELETE a DRAFT ("Discard" / "Delete"). A sent email is history and is never deleted: 409.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (!["GET", "PUT", "DELETE"].includes(req.method || "")) return res.status(405).json({ error: "Method not allowed" })
	await ensureDbConnected()
	const session = await requireAdminSession(req, res)
	if (!session) return

	const id = typeof req.query.id === "string" ? req.query.id : ""
	if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id." })
	const record = await AttendeeMailings.findById(id).lean()
	if (!record) return res.status(404).json({ error: "That email no longer exists." })
	const isDraft = (record as any).status === "draft"

	if (req.method === "GET") {
		const ids = [...((record as any).sourceEventIds || []), ...((record as any).promotedEventId ? [(record as any).promotedEventId] : [])]
		const events = ids.length ? await Events.find({ _id: { $in: ids } }).select(EVENT_OPTION_FIELDS).lean() : []
		const byId = new Map((events as any[]).map((e) => [String(e._id), toEventOption(e)]))
		const sourceEvents = ((record as any).sourceEventIds || []).map(
			(eid: any) => byId.get(String(eid)) || { _id: String(eid), name: "Event removed", removed: true },
		)
		const promotedEvent = (record as any).promotedEventId
			? byId.get(String((record as any).promotedEventId)) || {
					_id: String((record as any).promotedEventId),
					name: (record as any).promotedEventName || "Event removed",
					removed: true,
				}
			: null
		return res.status(200).json({ data: { ...record, sourceEvents, promotedEvent } })
	}

	if (!isDraft) return res.status(409).json({ error: "A sent email can't be changed. Use it again to send a copy." })

	if (req.method === "DELETE") {
		await AttendeeMailings.deleteOne({ _id: (record as any)._id, status: "draft" })
		return res.status(200).json({ data: { deleted: true } })
	}

	// PUT
	const parsed = await parseDraftBody(req.body)
	if ("error" in parsed) return res.status(400).json({ error: parsed.error })
	const userId = (session.user as any)?._id?.toString()
	const { promotedEventId, ...rest } = parsed.fields
	const updated = await AttendeeMailings.findOneAndUpdate(
		{ _id: (record as any)._id, status: "draft" },
		{
			$set: {
				...rest,
				...(promotedEventId ? { promotedEventId } : {}),
				...(userId && Types.ObjectId.isValid(userId) ? { updatedBy: new Types.ObjectId(userId) } : {}),
				updatedByEmail: (session.user as any)?.email,
			},
			// Un-linking the event must actually clear it.
			...(promotedEventId ? {} : { $unset: { promotedEventId: 1, promotedEventName: 1 } }),
		},
		{ new: true },
	).lean()
	if (!updated) return res.status(404).json({ error: "That draft no longer exists." })
	return res.status(200).json({ data: { _id: String((updated as any)._id), updatedAt: (updated as any).updatedAt } })
}
