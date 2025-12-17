import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Bookings } from "@/models/events/bookings"
import { dbconn } from "@/configs/database"

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse
) {
	if (req.method !== "GET") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	const { eventId } = req.query

	if (!eventId) {
		return res.status(400).json({ message: "Event ID is required" })
	}

	try {
		// Ensure database connection
		if (dbconn.readyState !== 1) {
			await Promise.race([
				dbconn.asPromise(),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("Connection timeout")), 30000)
				),
			])
		}

		// Get user session
		const session = await getServerSession(req, res, authOptions)

		if (!session || !session.user) {
			return res.status(200).json({ hasTicket: false, isAuthenticated: false })
		}

		const userEmail = (session.user as any).email

		if (!userEmail) {
			return res.status(200).json({ hasTicket: false, isAuthenticated: true })
		}

		// Check if user has a booking for this event
		const booking = await Bookings.findOne({
			eventId: eventId,
			customerEmail: userEmail.toLowerCase(),
			status: { $in: ["confirmed", "approved"] },
			isDeleted: false,
		})

		return res.status(200).json({
			hasTicket: !!booking,
			isAuthenticated: true,
			bookingId: booking?._id || null,
		})
	} catch (error: any) {
		console.error("Error checking ticket:", error)
		return res.status(500).json({ message: "Error checking ticket", error: error.message })
	}
}
