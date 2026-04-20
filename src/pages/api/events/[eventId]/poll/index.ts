import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import mongoose from "mongoose"
import { Users } from "@/models/userModal"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	const { eventId } = req.query as { eventId: string }

	if (req.method === "GET") {
		try {
			const event = await Events.findById(eventId).select("datePoll name")
			if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)
			if (!event.datePoll?.isActive) return sendResponse(res, null, "No active poll for this event.", false, ResCode.NOT_FOUND)

			// Collect all unique, valid ObjectIds for lookup
			const allVoterIds = new Set<string>()
			event.datePoll.options.forEach((opt: any) => {
				opt.votes.forEach((vid: string) => {
					if (mongoose.Types.ObjectId.isValid(vid)) allVoterIds.add(vid)
				})
			})

			const usersMap = new Map()
			if (allVoterIds.size > 0) {
				const users = await Users.find({ _id: { $in: Array.from(allVoterIds) } }).lean()
				users.forEach((u: any) => {
					usersMap.set(u._id.toString(), {
						id: u._id.toString(),
						name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Guest",
						image: u.image || null
					})
				})
			}

			const pollWithCounts = {
				isActive: event.datePoll.isActive,
				question: event.datePoll.question,
				options: event.datePoll.options.map((opt: any) => ({
					id: opt.id,
					date: opt.date,
					time: opt.time,
					label: opt.label,
					voteCount: opt.votes.length,
					voters: opt.votes.map((vid: string) => {
						if (usersMap.has(vid)) return usersMap.get(vid)
						return { id: vid, name: "Guest", image: null }
					})
				})),
				totalVotes: event.datePoll.options.reduce((sum: any, opt: any) => sum + opt.votes.length, 0),
			}

			return sendResponse(res, pollWithCounts, "Poll fetched successfully.", true, ResCode.OK)
		} catch (error: any) {
			return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
		}
	}

	return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
}
