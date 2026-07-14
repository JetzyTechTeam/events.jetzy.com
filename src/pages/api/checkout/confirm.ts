import { resolveEventLocation } from "@/lib/event-helpers"
import { sendTicketConfirmation } from "@/lib/send-grid"
import { uniqueId } from "@/lib/utils"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"
// import { Users } from "@/models/userModal"
// import { EventInvitation } from "@/models/events/event-invitations"

const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

type SessionMetadata = {
	eventId: string
	firstName: string
	lastName: string
	email: string
	phone: string
	tickets: string // JSON stringified array of ticket objects
	referralCode?: string
	discountPercentage?: string
	acceptedTerms?: string
	acceptedTermsAt?: string
}

type TicketsProps = Array<{
	id: number
	name: string
	price: number
	quantity: number
	isSelected: boolean
	desc: string
	eventId: string
	priceId: string
}>

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	await ensureDbConnected()

	try {
		const { session_id } = req.query
		if (!session_id || typeof session_id !== "string") {
			return res.status(400).json({ message: "Invalid session ID" })
		}

		const session = await stripe.checkout.sessions.retrieve(session_id)
		if (!session) {
			return res.status(404).json({ message: "Session not found" })
		}

		// get the session metadata
		const metadata = session.metadata as SessionMetadata

		// get the tickets from the metadata
		const tickets = JSON.parse(metadata.tickets) as TicketsProps

		const customAnswers: any[] = [];
		Object.keys(metadata).forEach(key => {
			if (key.startsWith('ans_')) {
				const val = metadata[key as keyof SessionMetadata] as string;
				try {
					customAnswers.push({
						questionId: key.replace('ans_', ''),
						answer: JSON.parse(val) // parse if it was an array/boolean
					});
				} catch (e) {
					customAnswers.push({
						questionId: key.replace('ans_', ''),
						answer: val // fallback to string
					});
				}
			}
		});

		// Handle referral code tracking
		let discountAmount = 0
		if (metadata.referralCode && metadata.discountPercentage) {
			try {
				const { ReferralCodes } = await import("@/models/events/referral-codes")
				const referralCode = await ReferralCodes.findOne({
					code: metadata.referralCode.trim().toUpperCase(),
					isDeleted: false,
				})

				if (referralCode) {
					// Calculate discount amount from original subtotal
					const subtotal = tickets.reduce((acc, curr) => acc + curr.price * curr.quantity, 0)
					const discountPercent = parseFloat(metadata.discountPercentage)
					// Round to 2 decimal places with Number.EPSILON to prevent floating-point edge cases
					discountAmount = Math.round((subtotal * (discountPercent / 100) + Number.EPSILON) * 100) / 100

					// Increment usage count
					referralCode.usageCount += 1
					await referralCode.save()
					console.log("[checkout/confirm] Referral code usage incremented:", metadata.referralCode)
				}
			} catch (referralError: any) {
				console.error("[checkout/confirm] Error processing referral code:", referralError)
				// Continue without failing the booking
			}
		}

		// Create a booking record if the payment was successful
		if (session.payment_status === "paid") {
			const subtotal = tickets.reduce((acc, curr) => acc + curr.price * curr.quantity, 0)
			const booking = await Bookings.create({
				status: BookingStatus.CONFIRMED,
				eventId: metadata.eventId,
				bookingRef: `JZ-${session.client_reference_id}`,
				customerName: `${metadata.firstName} ${metadata.lastName}`,
				customerEmail: metadata.email,
				customerPhone: metadata.phone,
				tickets: tickets.map((ticket) => ({
					ticketId: ticket.id,
					quantity: ticket.quantity,
				})),
				subTotal: subtotal,
				total: session.amount_total ? session.amount_total / 100 : 0,
				referralCode: metadata.referralCode || undefined,
				discountAmount: discountAmount,
				customAnswers: customAnswers,
				acceptedTerms: metadata.acceptedTerms === "true",
				acceptedTermsAt: metadata.acceptedTermsAt ? new Date(metadata.acceptedTermsAt) : undefined,
			})

			// update the event tracker
			await booking.updateEventTracker()

			const event = await Events.findById(metadata.eventId)
			if (!event) {
				return res.status(404).json({ message: "Event not found" })
			}

			// Check if location is hidden and reverse geocode if needed
			await resolveEventLocation(event)

			// send email to the customer
			try {
				console.log("Sending ticket confirmation email to:", metadata.email)
				let qrCodeImageUrl: string | undefined
				try {
					qrCodeImageUrl = await generateQRCodeForBooking(`JZ-${session.client_reference_id}`)
				} catch (qrError) {
					console.error("Failed to generate QR code:", qrError)
				}
				await sendTicketConfirmation({
					event,
					firstName: metadata.firstName,
					lastName: metadata.lastName,
					email: metadata.email,
					phone: metadata.phone,
					tickets: tickets.map((ticket) => ({
						name: ticket.name,
						price: ticket.price,
						quantity: ticket.quantity,
						desc: ticket.desc,
					})),
					orderNumber: `JZ-${session.client_reference_id}`,
					referralCode: metadata.referralCode,
					discountAmount: discountAmount > 0 ? discountAmount : undefined,
					discountPercentage: metadata.discountPercentage ? parseFloat(metadata.discountPercentage) : undefined,
					qrCodeImageUrl,
				})
				console.log("Ticket confirmation email sent successfully")
			} catch (emailError) {
				console.error("Failed to send ticket confirmation email:", emailError)
				// Don't fail the request if email fails
			}



			return res.status(200).json({ session, event })
		}

		return res.status(200).json({ session })
	} catch (error) {
		console.error("Error retrieving session:", error)
		return res.status(500).json({ message: "Internal server error" })
	}
}
