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
		const events = await Events.find({ isDeleted: false }).lean()

		// Sort events in memory:
		// 1. No start/end dates (Polls/TBD) -> Top
		// 2. Live/Upcoming events (endsOn >= now) sorted by startsOn ASC
		// 3. Past events (endsOn < now) sorted by endsOn DESC
		const now = new Date()
		
		const noDateEvents = events.filter((e: any) => !e.startsOn && !e.endsOn)
		const datedEvents = events.filter((e: any) => e.startsOn || e.endsOn)

		const upcomingEvents = datedEvents.filter((e: any) => !e.endsOn || new Date(e.endsOn) >= now)
		const pastEvents = datedEvents.filter((e: any) => e.endsOn && new Date(e.endsOn) < now)

		upcomingEvents.sort((a: any, b: any) => {
			const timeA = a.startsOn ? new Date(a.startsOn).getTime() : new Date().getTime()
			const timeB = b.startsOn ? new Date(b.startsOn).getTime() : new Date().getTime()
			return timeA - timeB
		})
		
		pastEvents.sort((a: any, b: any) => {
			const timeA = a.endsOn ? new Date(a.endsOn).getTime() : 0
			const timeB = b.endsOn ? new Date(b.endsOn).getTime() : 0
			return timeB - timeA
		})

		const sortedEvents = [...noDateEvents, ...upcomingEvents, ...pastEvents]

		return sendResponse(res, sortedEvents, "Events retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
