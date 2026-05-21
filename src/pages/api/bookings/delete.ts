import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { EventTracker } from "@/models/events/event-tracker"
import { CheckIn } from "@/models/checkIn"
import zod from "zod"

const schema = zod.object({
	bookingRef: zod.string().nonempty(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	const userRole = (session?.user as any)?.role
	const userId = (session?.user as any)?._id?.toString()
	if (!userId) return sendResponse(res, null, "Not authenticated.", false, ResCode.UNAUTHORIZED)

	const isAdmin = userRole === "admin" || userRole === "super admin"

	const parsed = schema.safeParse(req.body)
	if (!parsed.success) return sendResponse(res, null, "Invalid input.", false, ResCode.BAD_REQUEST)

	const { bookingRef } = parsed.data
	const booking = await Bookings.findOne({ bookingRef }).lean()
	if (!booking) return sendResponse(res, null, "Booking not found.", false, ResCode.NOT_FOUND)

	if (!isAdmin) {
		const event = await Events.findById((booking as any).eventId, { ownerId: 1 }).lean()
		if (!event || (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
		}
	}

	const ticketCount = (booking as any).tickets.reduce((sum: number, t: any) => sum + (t.quantity || 0), 0)

	await Promise.all([
		Bookings.deleteOne({ bookingRef }),
		CheckIn.deleteOne({ bookingId: (booking as any)._id }),
		EventTracker.findOneAndUpdate(
			{ eventId: (booking as any).eventId },
			{ $inc: { bookedTickets: -ticketCount } }
		),
	])

	return sendResponse(res, null, "Booking deleted.", true, ResCode.OK)
}
