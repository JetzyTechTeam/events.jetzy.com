// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		await ensureDbConnected()
		// Get all events from the database
		const events = await Events.find({ isDeleted: false, privacy: { $ne: 'private' } }).lean()

		// Sort events in memory:
		// 1. No start/end dates (Polls/TBD) -> Top
		// 2. Live/Upcoming events (endsOn >= now) sorted by startsOn ASC
		// 3. Past events (endsOn < now) sorted by endsOn DESC
		const now = new Date()

		const upcomingAll = events.filter((e: any) => !e.endsOn || new Date(e.endsOn) >= now)
		const pastEvents  = events.filter((e: any) => e.endsOn && new Date(e.endsOn) < now)

		const getSortTime = (e: any): number => {
			if (e.startsOn) return new Date(e.startsOn).getTime()
			if (e.endsOn)   return new Date(e.endsOn).getTime()
			if (e.datePoll?.options?.length > 0 && e.datePoll.options[0].date) {
				const opt = e.datePoll.options[0]
				return new Date(`${opt.date}T${opt.time || "00:00"}`).getTime()
			}
			if (e.createdAt) return new Date(e.createdAt).getTime()
			return 0
		}

		upcomingAll.sort((a: any, b: any) => getSortTime(a) - getSortTime(b))

		pastEvents.sort((a: any, b: any) => {
			const tA = a.endsOn ? new Date(a.endsOn).getTime() : 0
			const tB = b.endsOn ? new Date(b.endsOn).getTime() : 0
			return tB - tA
		})

		const sortedEvents = [...upcomingAll, ...pastEvents]

		const LIMIT = 20
		const page = Math.max(1, parseInt(req.query.page as string) || 1)
		const total = sortedEvents.length
		const totalPages = Math.ceil(total / LIMIT)
		const skip = (page - 1) * LIMIT
		const paginated = sortedEvents.slice(skip, skip + LIMIT)

		return res.status(200).json({
			data: paginated,
			pagination: { total, page, showing: paginated.length, limit: LIMIT, totalPages },
			message: "Events retrieved successfully!",
			status: true,
		})
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
