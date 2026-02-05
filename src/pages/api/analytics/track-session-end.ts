import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { UserSession } from "@/models/analytics"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const { sessionId, exitPage } = req.body

		if (!sessionId) {
			return sendResponse(res, null, "Session ID is required", false, ResCode.BAD_REQUEST)
		}

		// Find the session and update it
		const session = await UserSession.findOne({ sessionId })

		if (!session) {
			// Session not found - that's okay, just return success
			return sendResponse(res, { success: true }, "Session ended", true, ResCode.OK)
		}

		const endTime = new Date()
		const duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000) // in seconds

		// Update session
		session.endTime = endTime
		session.duration = duration
		session.exitPage = exitPage || session.exitPage
		await session.save()

		return sendResponse(res, { success: true, duration }, "Session ended", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Track Session End] Error:", error.message)
		// Return OK to not break frontend
		return sendResponse(res, null, "Session tracking failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

