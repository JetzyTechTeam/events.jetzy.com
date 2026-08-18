import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { buildDateFilter, escapeCsv, escapeRegex } from "@/lib/qrSignups"
import { Types } from "mongoose"

/**
 * "How many people came in on which referral code?"
 *
 * Reads BOOKINGS, not the referral-code records. `usageCount` on a code is a counter that a
 * host can reset by deleting and recreating the code, and it says nothing about who, when, or
 * for how much. The bookings are the evidence: each one stores the code string it was bought
 * with, alongside the buyer, the event and the money.
 *
 * Two shapes from one endpoint:
 *   - no `code` param  → one row per code (per event), the summary a CEO asks for;
 *   - `code=ABC`       → the individual bookings behind that code.
 *
 * `format=csv` exports whichever shape is being asked for, over the FULL filtered set rather
 * than the current page — the same contract as the QR signup export.
 *
 * Admin sees every event. An event owner sees their own events and nothing else, which is why
 * the owner branch resolves their event ids first and then constrains every query to them: a
 * missing filter here would hand one host another host's buyer list.
 */

const CANCELLED = ["cancelled", "canceled", "rejected", "failed", "expired"]

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

		const { Bookings } = await import("@/models/events/bookings")
		const { Events } = await import("@/models/events")

		const { dateFrom, dateTo, eventId, code, format, includeCancelled } = req.query as Record<string, string>

		const and: any[] = [{ referralCode: { $exists: true, $nin: [null, ""] } }]

		// Owner scoping FIRST. An owner with no events gets an empty report, never everything.
		let ownedEventIds: Types.ObjectId[] | null = null
		if (!isAdmin) {
			const owned = await Events.find({ ownerId: userId, isDeleted: false }).select("_id").lean()
			ownedEventIds = owned.map((e: any) => e._id)
			and.push({ eventId: { $in: ownedEventIds } })
		}

		if (eventId && Types.ObjectId.isValid(eventId)) {
			and.push({ eventId: new Types.ObjectId(eventId) })
		}

		const dateFilter = buildDateFilter(dateFrom, dateTo)
		if (dateFilter) and.push({ createdAt: dateFilter })

		// Cancelled and rejected bookings are excluded by default: "how many people came in on
		// this code" is a question about people who actually came. `status` is not a closed set
		// (the mobile app writes `checked_in`), so this excludes rather than allowlists.
		if (includeCancelled !== "true") and.push({ status: { $nin: CANCELLED } })

		if (code?.trim()) {
			and.push({ referralCode: { $regex: `^${escapeRegex(code.trim())}$`, $options: "i" } })
		}

		const match = { $and: and }

		// ---- Detail: the people, either behind ONE code or across every code in scope ----
		//
		// `detail=bookings` without a code is the "who came in through referrals at all" list —
		// asked at least as often as the per-code one, and the same query minus a filter.
		if (code?.trim() || (req.query.detail as string) === "bookings") {
			const rows = await Bookings.find(match)
				.select("bookingRef customerName customerEmail eventId status subTotal total discountAmount referralCode referralDiscountPercentage tickets createdAt")
				.sort({ createdAt: -1 })
				.limit(format === "csv" ? 50000 : 500)
				.lean()

			const events = await Events.find({ _id: { $in: rows.map((r: any) => r.eventId) } })
				.select("name")
				.lean()
			const eventName = new Map(events.map((e: any) => [String(e._id), e.name]))

			const shaped = rows.map((r: any) => ({
				bookingRef: r.bookingRef,
				referralCode: (r.referralCode || "").toUpperCase(),
				name: r.customerName || "",
				email: r.customerEmail || "",
				event: eventName.get(String(r.eventId)) || "",
				eventId: String(r.eventId),
				status: r.status,
				tickets: (r.tickets || []).reduce((sum: number, t: any) => sum + (t.quantity || 0), 0),
				subTotal: Number(r.subTotal || 0),
				total: Number(r.total || 0),
				discount: Number(r.discountAmount || 0),
				discountPercentage: r.referralDiscountPercentage ?? null,
				bookedAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
			}))

			if (format === "csv") {
				const headers = ["Booked", "Code", "Booking Ref", "Name", "Email", "Event", "Status", "Tickets", "Subtotal", "Discount", "Paid"]
				const lines = [
					headers.join(","),
					...shaped.map((r) =>
						[r.bookedAt || "", r.referralCode, r.bookingRef, r.name, r.email, r.event, r.status, r.tickets, r.subTotal, r.discount, r.total]
							.map(escapeCsv)
							.join(","),
					),
				]
				const slug = code?.trim() ? code.trim().toUpperCase() : "all"
				res.setHeader("Content-Type", "text/csv;charset=utf-8;")
				res.setHeader("Content-Disposition", `attachment; filename="referral-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`)
				return res.status(200).send(lines.join("\n"))
			}

			return sendResponse(
				res,
				{ code: code?.trim() ? code.trim().toUpperCase() : null, rows: shaped, total: shaped.length },
				"Referral bookings retrieved",
				true,
				ResCode.OK,
			)
		}

		// ---- Summary: one row per code, per event ----
		//
		// Grouped by BOTH, because a code string is globally unique but can be reassigned to
		// another event when it is deleted and recreated — folding those together would credit
		// one event with another's sales.
		const grouped = await Bookings.aggregate([
			{ $match: match },
			{
				$group: {
					_id: { code: { $toUpper: "$referralCode" }, eventId: "$eventId" },
					bookings: { $sum: 1 },
					// Buyers, not bookings: one person booking twice is one person who came in on
					// the code. Lowercased because `customerEmail` has no `lowercase: true`.
					buyers: { $addToSet: { $toLower: "$customerEmail" } },
					tickets: { $sum: { $sum: "$tickets.quantity" } },
					gross: { $sum: { $ifNull: ["$subTotal", 0] } },
					revenue: { $sum: { $ifNull: ["$total", 0] } },
					discountGiven: { $sum: { $ifNull: ["$discountAmount", 0] } },
					firstUsed: { $min: "$createdAt" },
					lastUsed: { $max: "$createdAt" },
				},
			},
			{ $sort: { bookings: -1 } },
			{ $limit: 1000 },
		])

		const eventIds = grouped.map((g: any) => g._id.eventId).filter(Boolean)
		const events = await Events.find({ _id: { $in: eventIds } }).select("name startsOn").lean()
		const eventName = new Map(events.map((e: any) => [String(e._id), e.name]))

		// The codes themselves, for the terms each one carries. A code deleted since is still
		// reported on — the bookings happened — it simply has no terms to show.
		const { ReferralCodes } = await import("@/models/events/referral-codes")
		const codeDocs = await ReferralCodes.find({ code: { $in: grouped.map((g: any) => g._id.code) } })
			.select("code eventId discountPercentage freeMembershipMonths isActive isDeleted maxUses usageCount")
			.lean()
		const codeByKey = new Map(codeDocs.map((c: any) => [`${c.code}|${String(c.eventId)}`, c]))

		const rows = grouped.map((g: any) => {
			const meta: any = codeByKey.get(`${g._id.code}|${String(g._id.eventId)}`)
			return {
				code: g._id.code,
				eventId: String(g._id.eventId),
				event: eventName.get(String(g._id.eventId)) || "",
				buyers: (g.buyers || []).filter(Boolean).length,
				bookings: g.bookings,
				tickets: g.tickets || 0,
				gross: Math.round((g.gross + Number.EPSILON) * 100) / 100,
				revenue: Math.round((g.revenue + Number.EPSILON) * 100) / 100,
				discountGiven: Math.round((g.discountGiven + Number.EPSILON) * 100) / 100,
				discountPercentage: meta?.discountPercentage ?? null,
				freeMembershipMonths: meta?.freeMembershipMonths || 0,
				maxUses: meta?.maxUses ?? null,
				// A code can be deleted or switched off and its past bookings still count.
				state: !meta ? "deleted" : meta.isDeleted ? "deleted" : meta.isActive ? "active" : "inactive",
				firstUsed: g.firstUsed ? new Date(g.firstUsed).toISOString() : null,
				lastUsed: g.lastUsed ? new Date(g.lastUsed).toISOString() : null,
			}
		})

		if (format === "csv") {
			const headers = [
				"Code", "Event", "State", "Buyers", "Bookings", "Tickets", "Gross", "Discount Given", "Collected",
				"Discount %", "Free Premium Months", "First Used", "Last Used",
			]
			const lines = [
				headers.join(","),
				...rows.map((r) =>
					[
						r.code, r.event, r.state, r.buyers, r.bookings, r.tickets, r.gross, r.discountGiven, r.revenue,
						r.discountPercentage ?? "", r.freeMembershipMonths, r.firstUsed || "", r.lastUsed || "",
					]
						.map(escapeCsv)
						.join(","),
				),
			]
			res.setHeader("Content-Type", "text/csv;charset=utf-8;")
			res.setHeader("Content-Disposition", `attachment; filename="referral-codes-${new Date().toISOString().slice(0, 10)}.csv"`)
			return res.status(200).send(lines.join("\n"))
		}

		const totals = rows.reduce(
			(acc, r) => ({
				buyers: acc.buyers + r.buyers,
				bookings: acc.bookings + r.bookings,
				tickets: acc.tickets + r.tickets,
				revenue: Math.round((acc.revenue + r.revenue + Number.EPSILON) * 100) / 100,
				discountGiven: Math.round((acc.discountGiven + r.discountGiven + Number.EPSILON) * 100) / 100,
			}),
			{ buyers: 0, bookings: 0, tickets: 0, revenue: 0, discountGiven: 0 },
		)

		return sendResponse(res, { rows, totals, codes: rows.length }, "Referral report retrieved", true, ResCode.OK)
	} catch (error: any) {
		console.error("[analytics/referrals] Error:", error)
		return sendResponse(res, null, error.message || "Failed to build the referral report", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
