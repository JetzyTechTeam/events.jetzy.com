import { sendTicketConfirmation, sendEventInvitation } from "@/lib/send-grid"
import { uniqueId } from "@/lib/utils"
import { generateQRCodeForBooking } from "@/lib/qr-generator"
import { Events } from "@/models/events"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { NextApiRequest, NextApiResponse } from "next"
import Stripe from "stripe"
import { Users } from "@/models/userModal"
import { EventInvitation } from "@/models/events/event-invitations"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import mongoose from "mongoose"

dayjs.extend(utc)
dayjs.extend(timezone)

const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)

type SessionMetadata = {
	eventId: string
	firstName: string
	lastName: string
	email: string
	phone: string
	tickets: string // JSON stringified array of ticket objects
	guestEmails?: string // JSON stringified array of guest emails
	referralCode?: string
	discountPercentage?: string
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
		console.log("[checkout/confirm] Method not allowed:", req.method)
		return res.status(405).json({ message: "Method not allowed" })
	}

	try {
		console.log("[checkout/confirm] Request received")
		
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[checkout/confirm] Database not connected, attempting to connect...")
			try {
				await Promise.race([
					dbconn.asPromise(),
					new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 30000)),
				])
				console.log("[checkout/confirm] Database connected successfully")
			} catch (connError: any) {
				console.error("[checkout/confirm] Database connection failed:", connError.message)
				return res.status(500).json({ message: "Database connection failed. Please try again later." })
			}
		}
		
		const { session_id } = req.query
		console.log("[checkout/confirm] Session ID:", session_id)
		
		if (!session_id || typeof session_id !== "string") {
			console.log("[checkout/confirm] Invalid session ID")
			return res.status(400).json({ message: "Invalid session ID" })
		}

		console.log("[checkout/confirm] Retrieving Stripe session...")
		const session = await stripe.checkout.sessions.retrieve(session_id)
		console.log("[checkout/confirm] Stripe session retrieved. Payment status:", session.payment_status)
		
		if (session.payment_status !== "paid") {
			return res.status(400).json({ 
				message: "Payment not completed",
				payment_status: session.payment_status
			})
		}

		// get the session metadata
		const metadata = session.metadata as SessionMetadata

		if (!metadata || !metadata.tickets) {
			console.error("[checkout/confirm] Missing metadata or tickets in session")
			return res.status(400).json({ message: "Invalid session metadata" })
		}

		// get the tickets from the metadata
		let tickets: TicketsProps
		try {
			tickets = JSON.parse(metadata.tickets) as TicketsProps
		} catch (parseError: any) {
			console.error("[checkout/confirm] Error parsing tickets from metadata:", parseError)
			return res.status(400).json({ message: "Invalid tickets data in session" })
		}
		
		// get guest emails from metadata if available
		let guestEmails: string[] = []
		if (metadata.guestEmails) {
			try {
				guestEmails = JSON.parse(metadata.guestEmails) as string[]
			} catch (e) {
				console.error("[checkout/confirm] Error parsing guest emails:", e)
			}
		}

		// Handle referral code tracking
		let discountAmount = 0
		if (metadata.referralCode && metadata.discountPercentage) {
			try {
				const { ReferralCodes } = await import("@/models/events/referral-codes")
				const referralCode = await ReferralCodes.findOne({
					code: metadata.referralCode.toUpperCase(),
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
			console.log("[checkout/confirm] Payment successful, creating booking...")
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
			})
			console.log("[checkout/confirm] Booking created:", booking.bookingRef)

			// Generate QR code for the booking
			let qrCodeToken: string | undefined
			let qrCodeImageUrl: string | undefined
			try {
				console.log("[checkout/confirm] Generating QR code for booking...")
				console.log("[checkout/confirm] Booking ID:", booking._id.toString())
				console.log("[checkout/confirm] Event ID:", metadata.eventId)
				
				// Determine base URL for QR code
				// TODO: Change back to environment variable after testing
				const baseUrl = process.env.NEXT_PUBLIC_URL
				if (!baseUrl) {
					console.warn("[checkout/confirm] NEXT_PUBLIC_URL not set, skipping QR code generation")
					throw new Error("NEXT_PUBLIC_URL environment variable is required for QR code generation")
				}
				
				const qrCode = await generateQRCodeForBooking(
					booking._id.toString(),
					metadata.eventId,
					baseUrl
				)
				qrCodeToken = qrCode.token
				qrCodeImageUrl = qrCode.imageUrl
				
				console.log("[checkout/confirm] QR code token generated:", qrCodeToken?.substring(0, 50) + '...')
				console.log("[checkout/confirm] QR code image URL length:", qrCodeImageUrl?.length)
				console.log("[checkout/confirm] QR code image URL starts with:", qrCodeImageUrl?.substring(0, 50))
				
				// Update booking with QR code data
				booking.qrCodeToken = qrCodeToken
				booking.qrCodeImageUrl = qrCodeImageUrl
				await booking.save()
				
				// Verify the QR code was saved
				const savedBooking = await Bookings.findById(booking._id)
				console.log("[checkout/confirm] QR code token saved to DB:", savedBooking?.qrCodeToken ? savedBooking.qrCodeToken.substring(0, 50) + '...' : 'NOT SAVED')
				console.log("[checkout/confirm] QR code image URL saved to DB:", savedBooking?.qrCodeImageUrl ? 'YES (length: ' + savedBooking.qrCodeImageUrl.length + ')' : 'NOT SAVED')
				
				console.log("[checkout/confirm] QR code generated and saved to booking successfully")
			} catch (qrError: any) {
				console.error("[checkout/confirm] Failed to generate QR code:", qrError.message)
				console.error("[checkout/confirm] QR code error stack:", qrError.stack)
				console.error("[checkout/confirm] QR code error details:", JSON.stringify(qrError, Object.getOwnPropertyNames(qrError)))
				// Continue without QR code - don't fail the booking
				// QR code is optional, booking should still be created
			}

			// update the event tracker
			console.log("[checkout/confirm] Updating event tracker...")
			await booking.updateEventTracker()
			console.log("[checkout/confirm] Event tracker updated")

			console.log("[checkout/confirm] Finding event:", metadata.eventId)
			const event = await Events.findById(metadata.eventId)
			if (!event) {
				console.log("[checkout/confirm] Event not found for ID:", metadata.eventId)
				return res.status(404).json({ message: "Event not found" })
			}
			console.log("[checkout/confirm] Event found:", event.name)

			// Check if user was newly created (has password) to include account info in email
			let isNewUser = false
			try {
				const user = await Users.findOne({ email: metadata.email.toLowerCase() })
				// If user exists and has a password, check if they were created recently
				if (user && user.password && user.password.trim() !== "") {
					// Check if user was created recently (within last 10 minutes)
					// This covers the time from checkout form submission to payment confirmation
					let userCreatedAt: Date
					if ((user as any).createdAt) {
						userCreatedAt = new Date((user as any).createdAt)
					} else {
						// Fallback: use ObjectId timestamp (MongoDB ObjectId contains creation timestamp)
						const objectId = user._id as any
						if (objectId && typeof objectId.getTimestamp === 'function') {
							userCreatedAt = objectId.getTimestamp()
						} else {
							// If we can't determine creation time, assume not new
							userCreatedAt = new Date(0)
						}
					}
					const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
					if (userCreatedAt > tenMinutesAgo) {
						isNewUser = true
						console.log("User was created recently, will include account info in email")
					}
				}
			} catch (userCheckError) {
				console.error("Error checking user status:", userCheckError)
				// Continue with email sending even if user check fails
			}

			// Save guest emails to EventInvitation collection and send invitation emails
			if (guestEmails.length > 0) {
				try {
					console.log("[checkout/confirm] Processing guest emails:", guestEmails)
					
					// Format event date for invitation email
					const eventTimezone = event.timezone?.split(') ')[1] || 'UTC'
					const eventStart = dayjs.utc(event.startsOn).tz(eventTimezone)
					const eventEnd = dayjs.utc(event.endsOn).tz(eventTimezone)
					const eventDate = `${eventStart.format('ddd, MMM DD, YYYY')} at ${eventStart.format('h:mm A')} - ${eventEnd.format('h:mm A')} ${eventTimezone}`
					
					// Create EventInvitation records for each guest
					const eventObjectId = new mongoose.Types.ObjectId(metadata.eventId)
					
					// Check which invitations already exist
					const existingInvitations = await EventInvitation.find({
						eventId: eventObjectId,
						email: { $in: guestEmails.map((e: string) => e.toLowerCase().trim()) }
					})
					
					const existingEmails = new Set(existingInvitations.map((inv: any) => inv.email.toLowerCase()))
					
					// Update existing invitations to include customerEmail if missing
					const customerEmailLower = metadata.email.toLowerCase().trim()
					for (const existingInv of existingInvitations) {
						if (!existingInv.customerEmail || existingInv.customerEmail !== customerEmailLower) {
							existingInv.customerEmail = customerEmailLower
							await existingInv.save()
							console.log(`[checkout/confirm] Updated customerEmail for existing invitation: ${existingInv.email}`)
						}
					}
					
					// Only create invitations for emails that don't already exist
					const newInvitations = guestEmails
						.filter((email: string) => !existingEmails.has(email.toLowerCase().trim()))
						.map((email: string) => ({
							eventId: eventObjectId,
							email: email.toLowerCase().trim(),
							customerEmail: customerEmailLower, // Link to the booking customer
							status: "pending" as const,
							invitedAt: new Date(),
						}))
					
					// Insert new invitations
					if (newInvitations.length > 0) {
						try {
							await EventInvitation.insertMany(newInvitations)
							console.log(`[checkout/confirm] Created ${newInvitations.length} new event invitations`)
						} catch (insertError: any) {
							console.error("[checkout/confirm] Error creating invitations:", insertError.message || insertError)
							// Try creating individually if bulk insert fails
							for (const invitation of newInvitations) {
								try {
									await EventInvitation.create(invitation)
									console.log(`[checkout/confirm] Created invitation for: ${invitation.email}`)
								} catch (individualError: any) {
									if (individualError.code !== 11000) { // Ignore duplicate key errors
										console.error(`[checkout/confirm] Failed to create invitation for ${invitation.email}:`, individualError.message)
									}
								}
							}
						}
					} else {
						console.log("[checkout/confirm] All guest emails already have invitations")
					}
					
					// Log total count and verify saved invitations
					const totalInvitations = await EventInvitation.countDocuments({ eventId: eventObjectId })
					const savedInvitations = await EventInvitation.find({ eventId: eventObjectId })
					console.log(`[checkout/confirm] Total invitations for this event: ${totalInvitations}`)
					console.log(`[checkout/confirm] Saved invitation emails:`, savedInvitations.map((inv: any) => inv.email))
					
					// Verify all guest emails are saved
					const savedEmails = new Set(savedInvitations.map((inv: any) => inv.email.toLowerCase()))
					const missingEmails = guestEmails.filter((email: string) => !savedEmails.has(email.toLowerCase().trim()))
					if (missingEmails.length > 0) {
						console.warn(`[checkout/confirm] WARNING: Some guest emails were not saved:`, missingEmails)
					} else {
						console.log(`[checkout/confirm] ✅ All ${guestEmails.length} guest emails are saved in database`)
					}
					
					// Send invitation emails to guests
					const publicUrl = process.env.NEXT_PUBLIC_URL
					if (!publicUrl) {
						console.warn("[checkout/confirm] NEXT_PUBLIC_URL not set, skipping guest invitation emails")
					} else {
						try {
							const hostName = `${metadata.firstName} ${metadata.lastName}`
							const emailPromises = guestEmails.map(async (guestEmail: string) => {
								try {
									await sendEventInvitation({
										email: guestEmail,
										eventName: event.name,
										eventSlug: event.slug,
										eventDate,
										eventLocation: event.location,
										hostName,
									})
									console.log(`[checkout/confirm] Invitation email sent to: ${guestEmail}`)
									return { email: guestEmail, success: true }
								} catch (error: any) {
									console.error(`[checkout/confirm] Failed to send invitation to ${guestEmail}:`, error.message)
									return { email: guestEmail, success: false }
								}
							})
							
							const emailResults = await Promise.allSettled(emailPromises)
							const successCount = emailResults.filter(
								(r) => r.status === 'fulfilled' && r.value.success
							).length
							console.log(`[checkout/confirm] Sent ${successCount}/${guestEmails.length} invitation emails`)
						} catch (guestError) {
							console.error("[checkout/confirm] Error processing guest emails:", guestError)
							// Don't fail the booking if guest processing fails
						}
					}
				} catch (guestEmailError: any) {
					console.error("[checkout/confirm] Error processing guest emails:", guestEmailError)
					// Don't fail the booking if guest email processing fails
				}
			}

			// send email to the customer
			try {
				console.log("[checkout/confirm] Sending ticket confirmation email to:", metadata.email, "isNewUser:", isNewUser, "guestEmails:", guestEmails.length)
				
				// Extract referral code and discount information from metadata or booking
				const referralCodeForEmail = metadata.referralCode || booking.referralCode || undefined
				const discountAmountForEmail = discountAmount > 0 ? discountAmount : (booking.discountAmount || undefined)
				const discountPercentageForEmail = metadata.discountPercentage ? parseFloat(metadata.discountPercentage) : undefined
				
				// Send email
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
					isNewUser,
					qrCodeImageUrl, // Pass QR code image to email
					guestEmails, // Pass guest emails to email
					referralCode: referralCodeForEmail,
					discountAmount: discountAmountForEmail,
					discountPercentage: discountPercentageForEmail,
				})
				console.log("[checkout/confirm] Ticket confirmation email sent successfully")
			} catch (emailError: any) {
				console.error("[checkout/confirm] Failed to send ticket confirmation email:", emailError.message || emailError)
				console.error("[checkout/confirm] Email error details:", JSON.stringify(emailError, null, 2))
				// Don't fail the request if email fails
			}
		}

		console.log("[checkout/confirm] Sending successful response")
		return res.status(200).json(session)
	} catch (error: any) {
		console.error("[checkout/confirm] Error:", error.message || error)
		console.error("[checkout/confirm] Stack trace:", error.stack)
		return res.status(500).json({ message: "Internal server error", error: error.message })
	}
}
