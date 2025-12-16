import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { EventInvitation } from "@/models/events/event-invitations"
import { sendEventInvitation } from "@/lib/send-grid"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
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

		const { eventId } = req.body

		if (!eventId) {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		// Get the event details
		const event = await Events.findById(eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Get all pending invitations for this event
		const pendingInvitations = await EventInvitation.find({
			eventId: event._id,
			status: "pending",
		})

		if (pendingInvitations.length === 0) {
			return sendResponse(res, null, "No pending invitations found", false, ResCode.BAD_REQUEST)
		}

		// Format event date and time
		const eventTimezone = event.timezone?.split(') ')[1] || 'UTC'
		const start = dayjs.utc(event.startsOn).tz(eventTimezone)
		const end = dayjs.utc(event.endsOn).tz(eventTimezone)
		const eventDate = `${start.format('ddd, MMM DD, YYYY')} at ${start.format('h:mm A')} - ${end.format('h:mm A')} ${eventTimezone}`

		// Send invitations to all pending guests
		const emailPromises = pendingInvitations.map(async (invitation) => {
			try {
				await sendEventInvitation({
					email: invitation.email,
					eventName: event.name,
					eventSlug: event.slug,
					eventDate,
					eventLocation: event.location,
					hostName: session.user?.name || session.user?.email || "Event Host",
				})
				return { email: invitation.email, success: true }
			} catch (error: any) {
				console.error(`Failed to send invitation to ${invitation.email}:`, error)
				return { email: invitation.email, success: false, error: error.message }
			}
		})

		const results = await Promise.allSettled(emailPromises)
		
		const successCount = results.filter(
			(r) => r.status === 'fulfilled' && r.value.success
		).length
		
		const failedCount = results.length - successCount

		if (successCount === 0) {
			return sendResponse(
				res, 
				{ successCount, failedCount, total: results.length }, 
				"Failed to send any invitations", 
				false, 
				ResCode.INTERNAL_SERVER_ERROR
			)
		}

		return sendResponse(
			res,
			{ successCount, failedCount, total: results.length },
			`Successfully sent ${successCount} invitation(s)${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error sending invitations:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
