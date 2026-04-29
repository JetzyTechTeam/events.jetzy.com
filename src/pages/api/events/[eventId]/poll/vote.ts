import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import mongoose from "mongoose"
import { Users } from "@/models/userModal"
import { Bookings } from "@/models/events/bookings"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
import zod from "zod"

const schema = zod.object({
	optionId: zod.string().nonempty(),
	voterId: zod.string().optional(), // anonymous voter token if not logged in
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	const { eventId } = req.query as { eventId: string }

	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
	}

	const session = await getServerSession(req, res, authOptions)
	const parsed = schema.safeParse(req.body)
	if (!parsed.success) return sendResponse(res, parsed.error.errors, "Invalid input.", false, ResCode.BAD_REQUEST)

	const { optionId, voterId } = parsed.data
	// Ensure the user is logged in
	// @ts-ignore
	const voterIdentifier: string = session?.user?.id
	if (!voterIdentifier) return sendResponse(res, null, "You must be logged in to vote.", false, ResCode.BAD_REQUEST)

	const userEmail = session?.user?.email
	if (!userEmail) return sendResponse(res, null, "We could not verify your email address.", false, ResCode.BAD_REQUEST)
	
	const hasBooked = await Bookings.exists({
		eventId,
		customerEmail: userEmail,
		isDeleted: false,
		status: { $in: ["confirmed", "approved", "pending"] }
	})

	if (!hasBooked) {
		// Try to see if waitlist? The user said "book ticket they the can poll only" so strict Bookings.
		return sendResponse(res, null, "Only attendees who have booked a ticket can vote in this poll.", false, ResCode.BAD_REQUEST)
	}

	try {
		const event = await Events.findById(eventId)
		if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)
		if (!event.datePoll?.isActive) return sendResponse(res, null, "No active poll for this event.", false, ResCode.NOT_FOUND)

		const optionIndex = event.datePoll.options.findIndex((o) => o.id === optionId)
		if (optionIndex === -1) return sendResponse(res, null, "Poll option not found.", false, ResCode.NOT_FOUND)

		// Remove voter from all options first (one vote per poll)
		for (const opt of event.datePoll.options) {
			opt.votes = opt.votes.filter((v) => v !== voterIdentifier)
		}

		// Add vote to selected option
		event.datePoll.options[optionIndex].votes.push(voterIdentifier)
		await Events.updateOne({ _id: eventId }, { $set: { datePoll: event.datePoll } })

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
				hasVoted: opt.votes.includes(voterIdentifier),
				voters: opt.votes.map((vid: string) => {
					if (usersMap.has(vid)) return usersMap.get(vid)
					return { id: vid, name: "Guest", image: null }
				})
			})),
			totalVotes: event.datePoll.options.reduce((sum: any, opt: any) => sum + opt.votes.length, 0),
			yourVote: optionId,
		}

		return sendResponse(res, pollWithCounts, "Vote recorded.", true, ResCode.OK)
	} catch (error: any) {
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
