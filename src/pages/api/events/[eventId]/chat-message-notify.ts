import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { Events } from "@/models/events"
import { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { sendChatMessageNotification } from "@/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		await ensureDbConnected()

		const { eventId } = req.query
		// messagePreview may also be present in the body but is intentionally ignored.
		const { senderName, recipientEmail, recipientName } = req.body

		// Validate required fields
		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!senderName || typeof senderName !== "string") {
			return sendResponse(res, null, "Sender name is required", false, ResCode.BAD_REQUEST)
		}
		if (!recipientEmail || typeof recipientEmail !== "string") {
			return sendResponse(res, null, "Recipient email is required", false, ResCode.BAD_REQUEST)
		}

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(recipientEmail)) {
			return sendResponse(res, null, "Invalid email address", false, ResCode.BAD_REQUEST)
		}

		// Get event details
		const event = await Events.findById(eventId).select("name slug")
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Send the email notification.
		// messagePreview is accepted in the body (chat app sends it) but intentionally not
		// included in the email — recipients must open the chat to read the message.
		await sendChatMessageNotification({
			email: recipientEmail,
			recipientName: recipientName || undefined,
			senderName,
			eventName: event.name,
			eventSlug: event.slug,
		})

		return sendResponse(
			res,
			{ sent: true, to: recipientEmail },
			"Chat message notification sent successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[chat-message-notify] Error:", error.message)
		return sendResponse(res, null, error.message || "Failed to send notification", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
