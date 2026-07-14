import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { EventTracker } from "@/models/events/event-tracker"
import { BookingStatus } from "@/models/events/types"
import { resolveEventLocation } from "@/lib/event-helpers"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { sendTicketConfirmation, sendAdminApprovalNotice } from "@/lib/send-grid"
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
	const booking = await Bookings.findOne({ bookingRef })
	if (!booking) return sendResponse(res, null, "Booking not found.", false, ResCode.NOT_FOUND)

	if (booking.status !== BookingStatus.PENDING) {
		return sendResponse(res, null, "This booking is not awaiting approval.", false, ResCode.BAD_REQUEST)
	}

	const event = await Events.findById(booking.eventId)
	if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)

	// Ownership: admin OR owner of the event
	if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
		return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
	}

	// Capacity check (0 = unlimited) — approval consumes capacity
	const requestedTickets = booking.tickets.reduce((sum, t) => sum + (t.quantity || 0), 0)
	const eventTracker = await EventTracker.findOne({ eventId: booking.eventId })
	if (eventTracker && eventTracker.eventCapacity > 0 && eventTracker.bookedTickets + requestedTickets > eventTracker.eventCapacity) {
		return sendResponse(res, null, "Cannot approve: event is at full capacity.", false, ResCode.BAD_REQUEST)
	}

	// Confirm the booking and consume capacity
	booking.status = BookingStatus.CONFIRMED
	await booking.save()
	await booking.updateEventTracker()

	await resolveEventLocation(event)

	// Build ticket details from the event's ticket subdocuments
	const [firstName, ...rest] = (booking.customerName || "").split(" ")
	const lastName = rest.join(" ")
	let ticketDetails = booking.tickets.map((bt) => {
		const et = (event as any).tickets?.find((t: any) => t._id?.toString() === bt.ticketId?.toString())
		return {
			name: et?.name || "Ticket",
			price: et?.price || 0,
			quantity: bt.quantity || 1,
			desc: et?.desc || "",
		}
	})

	// Free RSVPs can be booked without an explicit ticket selection — fall back to the
	// event's ticket(s) so the confirmation lists the free ticket instead of "Tickets (0)".
	if (ticketDetails.length === 0 && Array.isArray((event as any).tickets) && (event as any).tickets.length > 0) {
		ticketDetails = (event as any).tickets.map((t: any) => ({
			name: t.name || "General Admission",
			price: t.price || 0,
			quantity: 1,
			desc: t.desc || "",
		}))
	}

	// Send the celebratory "you've got a spot" confirmation (with QR + location) to the attendee
	try {
		let qrCodeImageUrl: string | undefined
		try {
			qrCodeImageUrl = await generateQRCodeForBooking(bookingRef)
		} catch (qrError) {
			console.error("Failed to generate QR code:", qrError)
		}
		await sendTicketConfirmation({
			event,
			firstName: firstName || booking.customerName,
			lastName,
			email: booking.customerEmail,
			phone: booking.customerPhone,
			tickets: ticketDetails,
			orderNumber: bookingRef,
			qrCodeImageUrl,
			approvalContext: true,
		})
	} catch (emailError) {
		console.error("Failed to send approval confirmation email:", emailError)
	}

	// Copy the admin inbox (contact@jetzyapp.com) that the request was approved
	try {
		await sendAdminApprovalNotice({
			event,
			firstName: firstName || booking.customerName,
			lastName,
			email: booking.customerEmail,
			tickets: ticketDetails,
			eventId: booking.eventId.toString(),
			kind: "approved",
		})
	} catch (adminError) {
		console.error("Failed to send admin approved notice:", adminError)
	}

	return sendResponse(res, { bookingRef, status: booking.status }, "Booking approved and confirmed.", true, ResCode.OK)
}
