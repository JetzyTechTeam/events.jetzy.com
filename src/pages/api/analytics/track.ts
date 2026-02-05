import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { EventTraffic } from "@/models/events/event-traffic"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		const { eventId, referralCode, visitorId } = req.body

		console.log('[Analytics Track API] Received request:', {
			eventId,
			referralCode,
			visitorId,
			hasSession: !!session,
			userId: session?.user ? (session.user as any)._id : undefined
		})

		if (!eventId) {
			console.error('[Analytics Track API] Missing eventId')
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		// Fire and forget logic - minimal validation for speed
		const trafficRecord = await EventTraffic.create({
			eventId: new Types.ObjectId(eventId),
			referralCode: referralCode || undefined,
			visitorId: visitorId || undefined,
			userId: session?.user && (session.user as any)._id ? new Types.ObjectId((session.user as any)._id) : undefined,
			timestamp: new Date(),
		})

		console.log('[Analytics Track API] Traffic record created:', {
			id: trafficRecord._id?.toString(),
			eventId: trafficRecord.eventId?.toString(),
			referralCode: trafficRecord.referralCode,
			visitorId: trafficRecord.visitorId,
			userId: trafficRecord.userId?.toString()
		})

		return sendResponse(res, { success: true }, "Tracked successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Track API] Tracking Error:", {
			message: error.message,
			stack: error.stack,
			code: error.code,
			name: error.name
		})
		// Return OK even on error to not break the frontend experience
		return sendResponse(res, null, "Tracking failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
