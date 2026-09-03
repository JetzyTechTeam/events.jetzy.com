import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { buildDateFilter, escapeCsv } from "@/lib/qrSignups"

/**
 * Opened vs. bought, for `/premium`, `/subscribe`, and a host's referral share link
 * (`/premium?code=&event=`).
 *
 * Reads `premium_page_views` — written on every page load and checkout attempt, and closed out
 * by the Stripe webhook once a sale is confirmed (see the model for the full write path). Rows
 * written before this shipped do not exist; there is no backfill, same as every other funnel in
 * this app — the traffic simply wasn't recorded.
 *
 * ADMIN ONLY, same reasoning as `/api/analytics/memberships`: this is directly downstream of
 * who is buying a subscription, and an event owner's referral link is broken out by name.
 */
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

		const { PremiumPageView } = await import("@/models/events/premium-page-view")
		const { Events } = await import("@/models/events")

		const { dateFrom, dateTo, format } = req.query as Record<string, string>
		const dateFilter = buildDateFilter(dateFrom, dateTo)
		const baseMatch: any = dateFilter ? { createdAt: dateFilter } : {}

		const stageCounts = (extraMatch: any = {}) => [
			{ $match: { ...baseMatch, ...extraMatch } },
			{
				$group: {
					_id: "$page",
					opens: { $sum: { $cond: [{ $ifNull: ["$landedAt", false] }, 1, 0] } },
					checkoutStarted: { $sum: { $cond: [{ $ifNull: ["$checkoutStartedAt", false] }, 1, 0] } },
					purchased: { $sum: { $cond: [{ $ifNull: ["$purchasedAt", false] }, 1, 0] } },
				},
			},
		]

		const [byPage, referralByPage, byReferralLink] = await Promise.all([
			PremiumPageView.aggregate(stageCounts()),
			// Same shape, restricted to rows that carry an event — i.e. a visit or purchase that
			// came from a host's referral share link rather than the plain page.
			PremiumPageView.aggregate(stageCounts({ eventId: { $exists: true, $ne: null } })),
			PremiumPageView.aggregate([
				{ $match: { ...baseMatch, eventId: { $exists: true, $ne: null } } },
				{
					$group: {
						_id: { code: "$code", eventId: "$eventId" },
						opens: { $sum: { $cond: [{ $ifNull: ["$landedAt", false] }, 1, 0] } },
						checkoutStarted: { $sum: { $cond: [{ $ifNull: ["$checkoutStartedAt", false] }, 1, 0] } },
						purchased: { $sum: { $cond: [{ $ifNull: ["$purchasedAt", false] }, 1, 0] } },
					},
				},
				{ $sort: { opens: -1 } },
				{ $limit: 200 },
			]),
		])

		const shapeStage = (rows: any[]) => {
			const byId = new Map(rows.map((r: any) => [r._id, r]))
			const pick = (page: string) => {
				const r = byId.get(page)
				return { opens: r?.opens || 0, checkoutStarted: r?.checkoutStarted || 0, purchased: r?.purchased || 0 }
			}
			return { premium: pick("premium"), subscribe: pick("subscribe") }
		}

		const eventIds = byReferralLink.map((r: any) => r._id.eventId).filter(Boolean)
		const events = eventIds.length ? await Events.find({ _id: { $in: eventIds } }).select("name").lean() : []
		const eventName = new Map(events.map((e: any) => [String(e._id), e.name]))

		const linkRows = byReferralLink.map((r: any) => ({
			code: r._id.code || "",
			eventId: String(r._id.eventId),
			event: eventName.get(String(r._id.eventId)) || "",
			opens: r.opens,
			checkoutStarted: r.checkoutStarted,
			purchased: r.purchased,
		}))

		if (format === "csv") {
			const headers = ["Code", "Event", "Opens", "Checkout started", "Purchased"]
			const lines = [
				headers.join(","),
				...linkRows.map((r) => [r.code, r.event, r.opens, r.checkoutStarted, r.purchased].map(escapeCsv).join(",")),
			]
			res.setHeader("Content-Type", "text/csv;charset=utf-8;")
			res.setHeader("Content-Disposition", `attachment; filename="premium-referral-links-${new Date().toISOString().slice(0, 10)}.csv"`)
			return res.status(200).send(lines.join("\n"))
		}

		return sendResponse(
			res,
			{
				byPage: shapeStage(byPage),
				referralByPage: shapeStage(referralByPage),
				byReferralLink: linkRows,
			},
			"Premium funnel report retrieved",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[analytics/premium-funnel] Error:", error)
		return sendResponse(res, null, error.message || "Failed to build the premium funnel report", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
