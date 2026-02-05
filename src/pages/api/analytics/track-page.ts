import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { PageView, UserSession, UserJourney } from "@/models/analytics"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		const session = await getServerSession(req, res, authOptions)
		const { sessionId, page, pageTitle, referrer, timeSpent, utmSource, utmMedium, utmCampaign, deviceType } = req.body

		if (!sessionId || !page) {
			return sendResponse(res, null, "Session ID and page are required", false, ResCode.BAD_REQUEST)
		}

		// Get user ID if logged in
		const userId = session?.user && (session.user as any)._id ? new Types.ObjectId((session.user as any)._id) : undefined

		// Parse user agent for browser type
		const userAgent = req.headers["user-agent"] || ""
		let browserType: string | undefined
		if (userAgent) {
			if (userAgent.includes("Chrome")) browserType = "Chrome"
			else if (userAgent.includes("Firefox")) browserType = "Firefox"
			else if (userAgent.includes("Safari")) browserType = "Safari"
			else if (userAgent.includes("Edge")) browserType = "Edge"
			else browserType = "Other"
		}

		// Fire and forget - don't block the request
		PageView.create({
			sessionId,
			userId: userId,
			page,
			pageTitle: pageTitle || undefined,
			referrer: referrer || undefined,
			userAgent: userAgent || undefined,
			ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || undefined,
			deviceType: deviceType || undefined,
			browserType,
			timestamp: new Date(),
			timeSpent: timeSpent || undefined,
			utmSource: utmSource || undefined,
			utmMedium: utmMedium || undefined,
			utmCampaign: utmCampaign || undefined,
		}).catch((error) => {
			console.error("[Analytics Track Page] Error:", error.message)
		})

		// Update session page count and exit page (fire-and-forget)
		// Update exitPage to the current page so we always have the latest page as potential exit page
		UserSession.findOneAndUpdate(
			{ sessionId },
			{ $inc: { pageCount: 1 }, $set: { exitPage: page } },
			{ upsert: false }
		).catch((error) => {
			console.error("[Analytics Track Page] Session update error:", error.message)
		})

		// Update UserJourney - add page_view step
		const journeyStep = {
			action: "page_view",
			page: page,
			timestamp: new Date(),
			duration: timeSpent || undefined,
			metadata: {
				pageTitle: pageTitle || undefined,
				referrer: referrer || undefined,
				deviceType: deviceType || undefined,
			},
		}

		UserJourney.findOneAndUpdate(
			{ sessionId },
			{
				$setOnInsert: {
					sessionId,
					userId: userId,
					journey: [],
				},
				$push: {
					journey: journeyStep,
				},
			},
			{ upsert: true, new: false }
		).catch((error) => {
			console.error("[Analytics Track Page] UserJourney update error:", error.message)
		})

		return sendResponse(res, { success: true }, "Page tracked successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("[Analytics Track Page] Error:", error.message)
		// Return OK to not break frontend
		return sendResponse(res, null, "Page tracking failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}

