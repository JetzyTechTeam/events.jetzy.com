import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { UserSession, PageView, WebClick, WebScroll, WebForm, EventInteraction } from "@/models/analytics"
import { Events } from "@/models/events"
import { Users } from "@/models/userModal"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()
		const session = await getServerSession(req, res, authOptions)
		if (!session) return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		const userRole = (session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const userId = (session.user as any)?._id?.toString()

		const sessionId = req.query.sessionId as string
		if (!sessionId) return sendResponse(res, null, "sessionId required", false, ResCode.BAD_REQUEST)

		const [sess, pageViews, clicks, scrolls, forms, interactions] = await Promise.all([
			UserSession.findOne({ sessionId }).lean(),
			PageView.find({ sessionId }).sort({ timestamp: 1 }).lean(),
			WebClick.find({ sessionId }).sort({ timestamp: 1 }).lean(),
			WebScroll.find({ sessionId }).lean(),
			WebForm.find({ sessionId }).sort({ timestamp: 1 }).lean(),
			EventInteraction.find({ sessionId }).sort({ timestamp: 1 }).lean(),
		])

		if (!sess) return sendResponse(res, null, "Session not found", false, ResCode.NOT_FOUND)

		if (!isAdmin) {
			const eventIds = Array.from(
				new Set(
					[
						...interactions.map((i: any) => i.eventId?.toString()).filter(Boolean),
						...clicks.map((c: any) => c.eventId?.toString()).filter(Boolean),
					] as string[]
				)
			)
			if (eventIds.length === 0) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)
			const owned = await Events.countDocuments({ _id: { $in: eventIds }, ownerId: userId })
			if (owned === 0) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)
		}

		const user = sess.userId ? await Users.findById(sess.userId, { email: 1, firstName: 1, lastName: 1 }).lean() : null

		const steps: any[] = []
		for (const pv of pageViews) {
			steps.push({ type: "page_view", timestamp: (pv as any).timestamp, page: (pv as any).page, timeSpent: (pv as any).timeSpent, pageTitle: (pv as any).pageTitle })
		}
		for (const c of clicks) {
			steps.push({
				type: "click",
				timestamp: (c as any).timestamp,
				page: (c as any).page,
				eventId: (c as any).eventId?.toString() || null,
				elementText: (c as any).elementText,
				elementTag: (c as any).elementTag,
				dataTrack: (c as any).dataTrack,
				href: (c as any).href,
				isRageClick: (c as any).isRageClick,
				x: (c as any).x,
				y: (c as any).y,
			})
		}
		for (const s of scrolls) {
			steps.push({ type: "scroll", timestamp: (s as any).timestamp, page: (s as any).page, maxDepthPct: (s as any).maxDepthPct, milestones: (s as any).reachedMilestones })
		}
		for (const f of forms) {
			steps.push({ type: "form", timestamp: (f as any).timestamp, page: (f as any).page, formName: (f as any).formName, interactionType: (f as any).interactionType, fieldName: (f as any).fieldName })
		}
		for (const i of interactions) {
			steps.push({
				type: "event_interaction",
				timestamp: (i as any).timestamp,
				eventId: (i as any).eventId?.toString() || null,
				interactionType: (i as any).interactionType,
				metadata: (i as any).metadata,
			})
		}

		steps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

		return sendResponse(
			res,
			{
				session: {
					sessionId: sess.sessionId,
					userId: sess.userId?.toString() || null,
					userEmail: (user as any)?.email || null,
					userName: user ? `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() : null,
					anonId: sess.anonId || null,
					isLoggedIn: sess.isLoggedIn,
					entryPage: sess.entryPage,
					exitPage: sess.exitPage || null,
					deviceType: sess.deviceType || null,
					browserType: sess.browserType || null,
					referrer: sess.referrer || null,
					startTime: sess.startTime,
					endTime: sess.endTime || null,
					duration: sess.duration || null,
					pageCount: sess.pageCount,
				},
				steps,
				counts: {
					pageViews: pageViews.length,
					clicks: clicks.length,
					rageClicks: clicks.filter((c: any) => c.isRageClick).length,
					scrolls: scrolls.length,
					forms: forms.length,
					interactions: interactions.length,
				},
			},
			"Session timeline retrieved",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[Journey Session Detail] Error:", error)
		return sendResponse(res, null, error.message || "Failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
