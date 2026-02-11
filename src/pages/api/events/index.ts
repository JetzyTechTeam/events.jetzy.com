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
		// 1. Live/Upcoming events (endsOn >= now) sorted by startsOn ASC
		// 2. Past events (endsOn < now) sorted by endsOn DESC
		const now = new Date()
		const upcomingEvents = events.filter((e: any) => new Date(e.endsOn) >= now)
		const pastEvents = events.filter((e: any) => new Date(e.endsOn) < now)

		upcomingEvents.sort((a: any, b: any) => new Date(a.startsOn).getTime() - new Date(b.startsOn).getTime())
		pastEvents.sort((a: any, b: any) => new Date(b.endsOn).getTime() - new Date(a.endsOn).getTime())

		const sortedEvents = [...upcomingEvents, ...pastEvents]

		return sendResponse(res, sortedEvents, "Events retrieved successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
