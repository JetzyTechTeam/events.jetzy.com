import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { PageView, WebForm } from "@/models/analytics"
import { EventUsers } from "@/models/eventUsersModal"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { QR_SIGNUP_PAGE as QR_PAGE, buildDateFilter, qrSourceMatch } from "@/lib/qrSignups"

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
		if (!isAdmin) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)

		const { dateFrom, dateTo } = req.query as Record<string, string>
		const dateFilter = buildDateFilter(dateFrom, dateTo)

		// Analytics collections timestamp on `timestamp`, EventUsers on `createdAt`.
		const pageMatch: any = { page: QR_PAGE }
		if (dateFilter) pageMatch.timestamp = dateFilter

		const userMatch: any = dateFilter ? { $and: [qrSourceMatch, { createdAt: dateFilter }] } : qrSourceMatch

		const [viewSessions, viewCount, focusSessions, submitSessions, accountsCreated, breakdown] = await Promise.all([
			PageView.distinct("sessionId", pageMatch),
			PageView.countDocuments(pageMatch),
			WebForm.distinct("sessionId", { ...pageMatch, interactionType: "focus" }),
			WebForm.distinct("sessionId", { ...pageMatch, interactionType: "submit" }),
			EventUsers.countDocuments(userMatch),
			EventUsers.aggregate([
				{ $match: userMatch },
				{
					$group: {
						_id: null,
						withRefCode: { $sum: { $cond: [{ $and: [{ $ne: ["$refCode", null] }, { $ne: ["$refCode", ""] }] }, 1, 0] } },
						withLocation: { $sum: { $cond: [{ $and: [{ $ne: ["$location", null] }, { $ne: ["$location", ""] }] }, 1, 0] } },
						viaSso: { $sum: { $cond: [{ $eq: ["$authProvider", "firebase"] }, 1, 0] } },
					},
				},
			]),
		])

		const funnel = [
			{ stage: "page_view", label: "Viewed QR signup page", count: viewSessions.length },
			{ stage: "form_focus", label: "Engaged with form", count: focusSessions.length },
			{ stage: "form_submit", label: "Submitted form", count: submitSessions.length },
			{ stage: "account_created", label: "Account created", count: accountsCreated },
		]

		const withRates = funnel.map((stage, i) => {
			const prev = i > 0 ? funnel[i - 1].count : stage.count
			const dropOff = prev > 0 ? ((prev - stage.count) / prev) * 100 : 0
			const conversionFromTop = funnel[0].count > 0 ? (stage.count / funnel[0].count) * 100 : 0
			return { ...stage, dropOffPct: Math.max(0, Math.round(dropOff * 10) / 10), conversionPct: Math.round(conversionFromTop * 10) / 10 }
		})

		const topLocations = await EventUsers.aggregate([
			{ $match: { $and: [userMatch, { location: { $exists: true, $ne: "" } }] } },
			{ $group: { _id: "$location", count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
			{ $limit: 5 },
			{ $project: { _id: 0, location: "$_id", count: 1 } },
		])

		const b = breakdown[0] || { withRefCode: 0, withLocation: 0, viaSso: 0 }

		return sendResponse(
			res,
			{
				funnel: withRates,
				totals: {
					pageViews: viewCount,
					uniqueVisitors: viewSessions.length,
					accountsCreated,
					conversionPct: viewSessions.length > 0 ? Math.round((accountsCreated / viewSessions.length) * 1000) / 10 : 0,
					withRefCode: b.withRefCode,
					withLocation: b.withLocation,
					viaSso: b.viaSso,
					viaEmail: Math.max(0, accountsCreated - b.viaSso),
				},
				topLocations,
			},
			"QR signup funnel retrieved",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[QR Signups Funnel] Error:", error)
		return sendResponse(res, null, error.message || "Failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
