import { createOrUpdateUser } from "@/lib/user-utils"
import { sendResponse } from "@/lib/helpers"
import { uniqueId } from "@/lib/utils"
import { resolveEventLocation } from "@/lib/event-helpers"
import { sendTicketConfirmation } from "@/lib/send-grid"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { Events } from "@/models/events"
import { NextApiRequest, NextApiResponse } from "next"

type BodyParams = {
	tickets: Array<{
		id: string
		name: string
		price: number
		quantity: number
		isSelected: boolean
		desc: string
		eventId: string
		priceId: string
	}>
	user: {
		firstName: string
		lastName: string
		email: string
		phone: string
	}
	eventId: string
	customAnswers?: Array<{ questionId: string; answer: any }>
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, 405)
	}

	await ensureDbConnected()

	try {
		const tickets = JSON.parse(req.body?.tickets) as BodyParams["tickets"]
		const user = JSON.parse(req.body?.user) as BodyParams["user"]
		const eventId = req.body?.eventId as string
		const customAnswers: Array<{ questionId: string; answer: any }> = req.body?.customAnswers
			? JSON.parse(req.body.customAnswers)
			: []

		if (!eventId) {
			return sendResponse(res, null, "Event ID is required", false, 400)
		}

		// Create or update user profile
		try {
			await createOrUpdateUser({
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
				role: "user",
			})
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
			console.error("Error creating user:", errorMessage)
		}

		// Validate required custom questions
		const event = await Events.findById(eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, 404)
		}
		if (event.questions && event.questions.length > 0) {
			const requiredQuestions = event.questions.filter((q: any) => q.isRequired)
			for (const reqQ of requiredQuestions) {
				const ans = customAnswers.find((a: any) => a.questionId === reqQ.id)
				if (!ans || !ans.answer || (Array.isArray(ans.answer) && ans.answer.length === 0)) {
					return sendResponse(res, null, `Required question "${reqQ.title}" is missing an answer.`, false, 400)
				}
			}
		}

		// Generate booking reference
		const reference = uniqueId(20)
		const bookingRef = `JZ-${reference}`

		const subtotal = tickets.reduce((acc, t) => acc + t.price * t.quantity, 0)

		// Create confirmed booking record
		const booking = await Bookings.create({
			status: BookingStatus.CONFIRMED,
			eventId,
			bookingRef,
			customerName: `${user.firstName} ${user.lastName}`,
			customerEmail: user.email,
			customerPhone: user.phone,
			tickets: tickets.map((ticket) => ({
				ticketId: ticket.id,
				quantity: ticket.quantity,
			})),
			subTotal: subtotal,
			total: 0,
			customAnswers: customAnswers.map((a) => ({
				questionId: a.questionId,
				answer: a.answer,
			})),
		})

		// Update event tracker capacity
		await booking.updateEventTracker()

		// event already fetched above for validation
		if (!event) {
			return sendResponse(res, null, "Event not found", false, 404)
		}

		await resolveEventLocation(event)

		// Send confirmation email
		try {
			let qrCodeImageUrl: string | undefined
			try {
				qrCodeImageUrl = await generateQRCodeForBooking(bookingRef)
			} catch (qrError) {
				console.error("Failed to generate QR code:", qrError)
			}
			await sendTicketConfirmation({
				event,
				firstName: user.firstName,
				lastName: user.lastName,
				email: user.email,
				phone: user.phone,
				tickets: tickets.map((ticket) => ({
					name: ticket.name,
					price: ticket.price,
					quantity: ticket.quantity,
					desc: ticket.desc,
				})),
				orderNumber: bookingRef,
				qrCodeImageUrl,
			})
		} catch (emailError) {
			console.error("Failed to send free ticket confirmation email:", emailError)
			// Don't fail the request if email fails
		}

		return sendResponse(res, { bookingRef, success: true }, "Registration confirmed!", true, 200)
	} catch (error) {
		console.error("Error in free-events checkout:", error)
		return sendResponse(res, null, "An unknown error occurred", false, 500)
	}
}
