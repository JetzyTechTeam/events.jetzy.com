import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { buildDateFilter, escapeCsv, escapeRegex } from "@/lib/qrSignups"

/**
 * Who bought a membership, how they arrived, and which code they used.
 *
 * Reads `membership_purchases` — one row per SALE, written at the moment the subscription is
 * created. The user document can't answer this: it holds current state, overwritten on every
 * renewal and cancellation, with no record of whether the buyer came through `/subscribe` or
 * bought a ticket that included membership, and no trace of an invite code at all.
 *
 * Rows written BEFORE this collection existed do not appear. There is no backfill: Stripe knows
 * nothing about our codes or events, so the history simply isn't recoverable — better an
 * obviously-short report than a confidently wrong one.
 *
 * ADMIN ONLY. This is a list of paying customers with their email addresses; an event owner has
 * no claim on it, even for a membership sold with their own ticket.
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

		const { MembershipPurchases } = await import("@/models/events/membership-purchases")
		const { Events } = await import("@/models/events")

		const { dateFrom, dateTo, membership = "premium", source, hasInviteCode, search, format } = req.query as Record<string, string>
		const pageNum = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1)
		const limitNum = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "25", 10) || 25))

		const and: any[] = []
		if (membership && membership !== "all") and.push({ key: membership })
		if (source) and.push({ source })

		const dateFilter = buildDateFilter(dateFrom, dateTo)
		if (dateFilter) and.push({ createdAt: dateFilter })

		if (hasInviteCode === "true") and.push({ inviteCode: { $exists: true, $nin: [null, ""] } })
		else if (hasInviteCode === "false") and.push({ $or: [{ inviteCode: { $exists: false } }, { inviteCode: "" }] })

		if (search?.trim()) {
			const rx = new RegExp(escapeRegex(search.trim()), "i")
			and.push({ $or: [{ email: rx }, { name: rx }, { inviteCode: rx }, { referralCode: rx }, { bookingRef: rx }] })
		}

		const match = and.length ? { $and: and } : {}

		const shape = async (docs: any[]) => {
			const eventIds = docs.map((d) => d.eventId).filter(Boolean)
			const events = eventIds.length
				? await Events.find({ _id: { $in: eventIds } }).select("name").lean()
				: []
			const eventName = new Map(events.map((e: any) => [String(e._id), e.name]))

			return docs.map((d: any) => ({
				_id: String(d._id),
				membership: d.key,
				source: d.source,
				email: d.email || "",
				name: d.name || "",
				interval: d.interval || "",
				amount: typeof d.amount === "number" ? d.amount : null,
				currency: d.currency || "usd",
				inviteCode: d.inviteCode || "",
				referralCode: d.referralCode || "",
				trialMonths: d.trialMonths || 0,
				trialEndsAt: d.trialEndsAt ? new Date(d.trialEndsAt).toISOString() : null,
				event: d.eventId ? eventName.get(String(d.eventId)) || "" : "",
				bookingRef: d.bookingRef || "",
				stripeSubscriptionId: d.stripeSubscriptionId || "",
				boughtAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
			}))
		}

		// The export covers the whole filtered set, not the page on screen.
		if (format === "csv") {
			const docs = await MembershipPurchases.find(match).sort({ createdAt: -1 }).limit(50000).lean()
			const rows = await shape(docs)
			const headers = [
				"Bought", "Membership", "Source", "Name", "Email", "Interval", "Amount", "Invite Code",
				"Referral Code", "Free Months", "First Charge", "Event", "Booking Ref", "Subscription",
			]
			const lines = [
				headers.join(","),
				...rows.map((r) =>
					[
						r.boughtAt || "", r.membership, r.source, r.name, r.email, r.interval, r.amount ?? "",
						r.inviteCode, r.referralCode, r.trialMonths || "", r.trialEndsAt || "", r.event,
						r.bookingRef, r.stripeSubscriptionId,
					]
						.map(escapeCsv)
						.join(","),
				),
			]
			res.setHeader("Content-Type", "text/csv;charset=utf-8;")
			res.setHeader("Content-Disposition", `attachment; filename="memberships-${new Date().toISOString().slice(0, 10)}.csv"`)
			return res.status(200).send(lines.join("\n"))
		}

		const [docs, total, bySource, byInvite] = await Promise.all([
			MembershipPurchases.find(match).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
			MembershipPurchases.countDocuments(match),
			MembershipPurchases.aggregate([{ $match: match }, { $group: { _id: "$source", count: { $sum: 1 } } }]),
			// One row per code, so a campaign can be read at a glance rather than counted by eye.
			MembershipPurchases.aggregate([
				{ $match: { $and: [...and, { inviteCode: { $exists: true, $nin: [null, ""] } }] } },
				{ $group: { _id: "$inviteCode", count: { $sum: 1 }, members: { $addToSet: "$email" } } },
				{ $sort: { count: -1 } },
				{ $limit: 50 },
			]),
		])

		return sendResponse(
			res,
			{
				rows: await shape(docs),
				total,
				page: pageNum,
				limit: limitNum,
				bySource: bySource.reduce((acc: Record<string, number>, row: any) => ({ ...acc, [row._id || "unknown"]: row.count }), {}),
				inviteCodes: byInvite.map((row: any) => ({
					code: row._id,
					redemptions: row.count,
					members: (row.members || []).filter(Boolean).length,
				})),
			},
			"Membership report retrieved",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[analytics/memberships] Error:", error)
		return sendResponse(res, null, error.message || "Failed to build the membership report", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
