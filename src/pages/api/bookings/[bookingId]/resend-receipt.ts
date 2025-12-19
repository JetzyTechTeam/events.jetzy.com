import { NextApiRequest, NextApiResponse } from "next"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { sendTicketConfirmation } from "@/lib/send-grid"
import { generateQRCodeDataUrl } from "@/lib/qr-generator"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to perform this action.", false, ResCode.UNAUTHORIZED)
		}

		const { bookingId } = req.query

		if (!bookingId) {
			return sendResponse(res, null, "Booking ID is required", false, ResCode.BAD_REQUEST)
		}

		// Find the booking
		const booking = await Bookings.findById(bookingId)
		if (!booking) {
			return sendResponse(res, null, "Booking not found", false, ResCode.NOT_FOUND)
		}

		// Get the event
		const event = await Events.findById(booking.eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Get ticket details from event
		const ticketDetails = booking.tickets.map((bookingTicket) => {
			const eventTicket = event.tickets.find((t: any) => t._id.toString() === bookingTicket.ticketId.toString())
			return {
				name: eventTicket?.name || "Unknown Ticket",
				price: parseFloat(eventTicket?.price || "0"),
				quantity: bookingTicket.quantity,
				desc: eventTicket?.desc || "",
			}
		})

		// Generate QR code if not exists or regenerate
		let qrCodeImageUrl = booking.qrCodeImageUrl
		if (booking.qrCodeToken) {
			try {
				qrCodeImageUrl = await generateQRCodeDataUrl(booking.qrCodeToken, process.env.NEXT_PUBLIC_URL)
			} catch (qrError) {
				console.error("Error generating QR code:", qrError)
				// Continue without QR code if generation fails
			}
		}

		// Parse customer name (assuming format "FirstName LastName")
		const nameParts = booking.customerName.split(" ")
		const firstName = nameParts[0] || ""
		const lastName = nameParts.slice(1).join(" ") || ""

		// Send receipt email
		await sendTicketConfirmation({
			event: {
				name: event.name,
				location: event.location,
				startsOn: event.startsOn,
				endsOn: event.endsOn,
				timezone: event.timezone,
			} as any,
			firstName,
			lastName,
			email: booking.customerEmail,
			phone: booking.customerPhone,
			tickets: ticketDetails,
			orderNumber: booking.bookingRef,
			isNewUser: false,
			qrCodeImageUrl,
			guestEmails: [],
		})

		return sendResponse(res, { success: true }, "Receipt sent successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error resending receipt:", error)
		return sendResponse(res, null, `Failed to resend receipt: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
