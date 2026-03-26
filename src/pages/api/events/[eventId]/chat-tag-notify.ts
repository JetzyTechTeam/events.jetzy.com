import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { sendChatTagNotification } from "@/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		await ensureDbConnected()

		const { eventId } = req.query
		const { taggerName, taggedEmail, taggedName } = req.body

		// Validate required fields
		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!taggerName || typeof taggerName !== "string") {
			return sendResponse(res, null, "Tagger name is required", false, ResCode.BAD_REQUEST)
		}
		if (!taggedEmail || typeof taggedEmail !== "string") {
			return sendResponse(res, null, "Tagged email is required", false, ResCode.BAD_REQUEST)
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(taggedEmail)) {
			return sendResponse(res, null, "Invalid email address", false, ResCode.BAD_REQUEST)
		}

		// Get event details
		const event = await Events.findById(eventId).select("name slug")
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Send the email notification
		await sendChatTagNotification({
			email: taggedEmail,
			taggedName: taggedName || undefined,
			taggerName,
			eventName: event.name,
			eventSlug: event.slug,
		})

		return sendResponse(
			res,
			{ sent: true, to: taggedEmail },
			"Chat tag notification sent successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[chat-tag-notify] Error:", error.message)
		return sendResponse(res, null, error.message || "Failed to send notification", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
