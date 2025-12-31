import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { UserSession } from "@/models/analytics"
import { Users } from "@/models/userModal"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"
import { randomUUID } from "crypto"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)
		const { sessionId, referrer, entryPage, userAgent, deviceType } = req.body

		// Generate sessionId if not provided
		const finalSessionId = sessionId || randomUUID()

		// Get user ID if logged in
		const userId = session?.user && (session.user as any)._id ? new Types.ObjectId((session.user as any)._id) : undefined

		// Fire and forget - don't block the request
		UserSession.create({
			sessionId: finalSessionId,
			userId: userId,
			startTime: new Date(),
			pageCount: 1,
			isLoggedIn: !!userId,
			referrer: referrer || undefined,
			entryPage: entryPage || "/",
			userAgent: userAgent || req.headers["user-agent"] || undefined,
			deviceType: deviceType || undefined,
			browserType: undefined, // Can be parsed from userAgent later if needed
			ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || undefined,
		}).catch((error) => {
			console.error("[Analytics Track Session Start] Error:", error.message)
		})

		// Fire and forget - update user's lastActiveAt timestamp (doesn't block the request)
		if (userId) {
			Users.updateOne(
				{ _id: userId },
				{ $set: { lastActiveAt: new Date() } }
			).catch((error) => {
				console.error("[Analytics Track Session Start] Error updating lastActiveAt:", error.message)
			})
		}

		return sendResponse(res, { sessionId: finalSessionId }, "Session started", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Track Session Start] Error:", error.message)
		// Return OK to not break frontend
		return sendResponse(res, null, "Session tracking failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

