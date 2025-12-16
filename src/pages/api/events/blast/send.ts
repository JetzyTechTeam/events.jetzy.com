import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { EventInvitation } from "@/models/events/event-invitations"
import { Bookings } from "@/models/events/bookings"
import { WaitingList } from "@/models/waitingList"
import { sendBlastEmail } from "@/lib/send-grid"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import type { NextApiRequest, NextApiResponse } from "next"
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'POST') {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	const session = await getServerSession(req, res, authOptions)

	try {
		if (!session) {
			return sendResponse(res, null, "You need to be logged in", false, ResCode.UNAUTHORIZED)
		}

		const { eventId, targetAudience, emailType, status, subject, message, customEmails } = req.body

		if (!eventId || !targetAudience || !emailType || !subject || !message) {
			return sendResponse(res, null, "All fields are required", false, ResCode.BAD_REQUEST)
		}

		// Validate custom emails if target is custom
		if (targetAudience === "custom" && (!customEmails || !Array.isArray(customEmails) || customEmails.length === 0)) {
			return sendResponse(res, null, "Custom email addresses are required", false, ResCode.BAD_REQUEST)
		}

		// Get event details
		const event = await Events.findById(eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Format event date
		const eventTimezone = event.timezone?.split(') ')[1] || 'UTC'
		const start = dayjs.utc(event.startsOn).tz(eventTimezone)
		const eventDate = start.format('ddd, MMM DD, YYYY [at] h:mm A')

		// Collect recipient emails
		const emails = new Set<string>()

		if (targetAudience === "custom") {
			// Use custom provided emails
			customEmails.forEach((email: string) => {
				const trimmed = email.trim().toLowerCase()
				if (trimmed && trimmed.includes("@")) {
					emails.add(trimmed)
				}
			})
		} else if (targetAudience === "all") {
			// Get all
			const bookings = await Bookings.find({ eventId, isDeleted: false })
			bookings.forEach(b => emails.add(b.customerEmail.toLowerCase()))

			const invited = await EventInvitation.find({ eventId })
			invited.forEach(i => emails.add(i.email.toLowerCase()))

			const waiting = await WaitingList.find({ eventId })
			waiting.forEach(w => emails.add(w.email.toLowerCase()))
		} else if (targetAudience === "bookings_only") {
			const bookings = await Bookings.find({ eventId, isDeleted: false })
			bookings.forEach(b => emails.add(b.customerEmail.toLowerCase()))
		} else if (targetAudience === "invited_only") {
			const query: any = { eventId }
			if (status && status !== "all") {
				query.status = status
			}
			const invited = await EventInvitation.find(query)
			invited.forEach(i => emails.add(i.email))
		} else if (targetAudience === "waiting_list") {
			const waiting = await WaitingList.find({ eventId })
			waiting.forEach(w => emails.add(w.email.toLowerCase()))
		}

		if (emails.size === 0) {
			return sendResponse(res, null, "No recipients found", false, ResCode.BAD_REQUEST)
		}

		// Send emails to all recipients
		const emailPromises = Array.from(emails).map(async (email) => {
			try {
				await sendBlastEmail({
					email,
					eventName: event.name,
					eventSlug: event.slug,
					eventDate,
					eventLocation: event.location,
					hostName: session.user?.name || session.user?.email || "Event Host",
					emailType,
					subject,
					customMessage: message,
				})
				return { email, success: true }
			} catch (error: any) {
				console.error(`Failed to send blast email to ${email}:`, error.message)
				return { email, success: false }
			}
		})

		const results = await Promise.allSettled(emailPromises)
		const successCount = results.filter(
			(r) => r.status === 'fulfilled' && r.value.success
		).length

		return sendResponse(
			res,
			{ sentCount: successCount, totalCount: emails.size },
			`Successfully sent ${successCount} email(s)`,
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error sending blast email:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
