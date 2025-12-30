import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)
		const { eventId, reason, description } = req.body

		if (!eventId || !reason) {
			return sendResponse(res, null, "Event ID and reason are required", false, ResCode.BAD_REQUEST)
		}

		// Verify event exists
		const event = await Events.findById(eventId)
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// For now, we'll just log the report
		// In a production system, you might want to store this in a database
		console.log("Event Report:", {
			eventId,
			reason,
			description,
			reportedBy: session?.user?.email || "Anonymous",
			userId: session?.user ? (session.user as any)._id : null,
			timestamp: new Date().toISOString(),
		})

		// TODO: Store report in database (create EventReport model if needed)
		// For now, we'll just acknowledge the report

		return sendResponse(
			res,
			{ success: true },
			"Report submitted successfully. Thank you for helping us keep the platform safe.",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error submitting event report:", error)
		return sendResponse(res, null, error.message || "Failed to submit report", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}


