import type { NextApiRequest, NextApiResponse } from "next"
import { Types } from "mongoose"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { eventHasAnyLimit, getEventAvailability } from "@/lib/ticket-availability"

/**
 * How many spots are left, per ticket and overall.
 *
 * Deliberately PUBLIC and unauthenticated, on the same reasoning that keeps
 * `api/events/[eventId]/totals.ts` public: it returns counts only, no PII, and the ticket list
 * on the event page has to know what is sold out before anyone signs in. Per-ticket sold counts
 * are not a new disclosure class — `totals.ts` already publishes the event-wide figure.
 *
 * `Cache-Control: no-store`. A cached availability number is a lie that sells a seat.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return res.status(405).json({ message: "Method is not allowed" })
	}

	const { eventId } = req.query
	if (!eventId || Array.isArray(eventId)) return res.status(400).json({ message: "Event ID is required" })
	if (!Types.ObjectId.isValid(eventId)) return res.status(400).json({ message: "Invalid event id" })

	try {
		await ensureDbConnected()

		// Only what the counts need. `tickets` carries the per-ticket limits; `capacity` is the
		// legacy event-wide ceiling.
		const event = await Events.findById(eventId).select("tickets capacity").lean()
		if (!event) return res.status(404).json({ message: "Event not found" })

		// Skip the aggregation entirely when nothing on the event is limited — which is every
		// event predating per-ticket capacity. This is read on the public event page, so the
		// common case must not cost a scan of the bookings.
		const availability = await getEventAvailability(event, undefined, { countSold: eventHasAnyLimit(event) })

		res.setHeader("Cache-Control", "no-store")
		return res.status(200).json(availability)
	} catch (error) {
		console.error("[events/availability] Failed to compute availability:", error)
		return res.status(500).json({ message: "Error fetching availability" })
	}
}
