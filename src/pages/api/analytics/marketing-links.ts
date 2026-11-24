import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Types } from "mongoose"
import { buildDateFilter, escapeCsv } from "@/lib/qrSignups"
import { loadManagedEventForMarketing } from "@/lib/marketing-link-server"
import { marketingPlatformLabel } from "@/lib/marketing-link"
import { MarketingLinks } from "@/models/events/marketing-links"
import { EventInteraction } from "@/models/analytics"
import { Bookings } from "@/models/events/bookings"
import { BookingStatus } from "@/models/events/types"
import { getCheckoutVerificationStats } from "@/lib/checkout-verification-stats"

/**
 * GET /api/analytics/marketing-links?eventId=&dateFrom=&dateTo=&format=csv
 *   One row per marketing link of the event, plus "direct" (no link), so the rows add up to the
 *   event's totals.
 * GET …&detail=bookings&linkId=<id | direct>
 *   The buyers behind one link.
 *
 * Admin OR event owner (the event id is `eventId` in the query, read by the shared guard).
 *
 * Stage definitions — kept identical to `event-windows.ts` / `journey/funnel.ts`:
 *   clicks          `view` interactions
 *   visitors        distinct anonId (sessionId for rows recorded before anonId was stored)
 *   picked / opened / submitted   distinct sessionId per interaction type
 *   bookings        live, non-pending bookings — classified by EXCLUSION, so `checked_in` counts
 *   revenue         `booking.total` — the ticket money, excluding membership sales
 */

const DEAD_STATUSES = ["cancelled", "canceled", "rejected", "failed", "refunded", "expired"]
const FUNNEL_TYPES = ["view", "ticket_select", "booking_start", "checkout_submit"] as const
const DIRECT = "direct"

type Row = {
	linkId: string
	label: string
	tag: string | null
	platform: string | null
	state: "active" | "inactive" | "deleted" | "direct"
	referralCode: string | null
	clicks: number
	visitors: number
	pickedTicket: number
	openedCheckout: number
	submittedCheckout: number
	/** Checkout email check — distinct sessions (see checkout-verification-stats.ts). */
	emailCodeSent: number
	emailVerified: number
	emailNeverVerified: number
	alreadySignedIn: number
	emailConfirmed: number
	bookings: number
	pending: number
	buyers: number
	tickets: number
	revenue: number
	conversion: number | null
}

const keyOf = (id: any) => (id ? String(id) : DIRECT)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	try {
		const access = await loadManagedEventForMarketing(req, res)
		if (!access) return
		const eventId = access.event._id
		const { dateFrom, dateTo, format, detail, linkId } = req.query as Record<string, string | undefined>
		const dateFilter = buildDateFilter(dateFrom, dateTo)

		const bookingMatch: any = {
			eventId,
			isDeleted: { $ne: true },
			status: { $nin: DEAD_STATUSES },
			...(dateFilter ? { createdAt: dateFilter } : {}),
		}

		const links = await MarketingLinks.find({ eventId }).lean()
		const linkById = new Map(links.map((l) => [String(l._id), l]))

		// ---- Detail: the buyers behind one link ----
		if (detail === "bookings") {
			if (!linkId) return sendResponse(res, null, "linkId is required", false, ResCode.BAD_REQUEST)
			if (linkId === DIRECT) bookingMatch.marketingLinkId = { $exists: false }
			else if (Types.ObjectId.isValid(linkId) && linkById.has(linkId)) bookingMatch.marketingLinkId = new Types.ObjectId(linkId)
			else return sendResponse(res, null, "Marketing link not found", false, ResCode.NOT_FOUND)

			const rows = await Bookings.find(bookingMatch)
				.select("bookingRef customerName customerEmail status total tickets referralCode createdAt")
				.sort({ createdAt: -1 })
				.limit(format === "csv" ? 50000 : 500)
				.lean()
			const shaped = rows.map((r: any) => ({
				bookingRef: r.bookingRef,
				name: r.customerName || "",
				email: r.customerEmail || "",
				status: r.status,
				tickets: (r.tickets || []).reduce((sum: number, t: any) => sum + (t.quantity || 0), 0),
				total: Number(r.total || 0),
				referralCode: r.referralCode ? String(r.referralCode).toUpperCase() : "",
				bookedAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
			}))

			if (format === "csv") {
				const label = linkId === DIRECT ? "direct" : linkById.get(linkId)?.tag || linkId
				const headers = ["Booked", "Booking Ref", "Name", "Email", "Status", "Tickets", "Paid", "Referral Code"]
				const lines = [
					headers.join(","),
					...shaped.map((r) => [r.bookedAt || "", r.bookingRef, r.name, r.email, r.status, r.tickets, r.total, r.referralCode].map(escapeCsv).join(",")),
				]
				res.setHeader("Content-Type", "text/csv;charset=utf-8;")
				res.setHeader("Content-Disposition", `attachment; filename="marketing-${label}-${new Date().toISOString().slice(0, 10)}.csv"`)
				return res.status(200).send(lines.join("\n"))
			}
			return sendResponse(res, { rows: shaped, total: shaped.length }, "Marketing link bookings retrieved", true, ResCode.OK)
		}

		// ---- Summary ----
		const interactionMatch: any = {
			eventId,
			interactionType: { $in: FUNNEL_TYPES as unknown as string[] },
			...(dateFilter ? { timestamp: dateFilter } : {}),
		}

		const [interactionFacets, bookingGroups, verificationByLink] = await Promise.all([
			EventInteraction.aggregate([
				{ $match: interactionMatch },
				{
					$facet: {
						// Distinct sessions per link per stage, and raw `view` rows for clicks.
						stages: [
							{ $group: { _id: { link: "$marketingLinkId", type: "$interactionType", sid: "$sessionId" }, n: { $sum: 1 } } },
							{ $group: { _id: { link: "$_id.link", type: "$_id.type" }, sessions: { $sum: 1 }, rows: { $sum: "$n" } } },
						],
						visitors: [
							{ $match: { interactionType: "view" } },
							{ $group: { _id: { link: "$marketingLinkId", who: { $ifNull: ["$anonId", "$sessionId"] } } } },
							{ $group: { _id: "$_id.link", visitors: { $sum: 1 } } },
						],
					},
				},
			]),
			Bookings.aggregate([
				{ $match: bookingMatch },
				{
					$group: {
						_id: "$marketingLinkId",
						bookings: { $sum: { $cond: [{ $eq: ["$status", BookingStatus.PENDING] }, 0, 1] } },
						pending: { $sum: { $cond: [{ $eq: ["$status", BookingStatus.PENDING] }, 1, 0] } },
						buyers: { $addToSet: { $cond: [{ $eq: ["$status", BookingStatus.PENDING] }, null, { $toLower: "$customerEmail" }] } },
						tickets: { $sum: { $cond: [{ $eq: ["$status", BookingStatus.PENDING] }, 0, { $sum: "$tickets.quantity" }] } },
						revenue: { $sum: { $cond: [{ $eq: ["$status", BookingStatus.PENDING] }, 0, { $ifNull: ["$total", 0] }] } },
					},
				},
			]),
			// Split by link; "" is the rows with no link (direct).
			getCheckoutVerificationStats(
				{ eventId, ...(dateFilter ? { timestamp: dateFilter } : {}) },
				"marketingLinkId",
			),
		])

		const blank = (): Omit<Row, "linkId" | "label" | "tag" | "platform" | "state" | "referralCode"> => ({
			clicks: 0,
			visitors: 0,
			pickedTicket: 0,
			openedCheckout: 0,
			submittedCheckout: 0,
			emailCodeSent: 0,
			emailVerified: 0,
			emailNeverVerified: 0,
			alreadySignedIn: 0,
			emailConfirmed: 0,
			bookings: 0,
			pending: 0,
			buyers: 0,
			tickets: 0,
			revenue: 0,
			conversion: null,
		})
		const stats = new Map<string, ReturnType<typeof blank>>()
		const statFor = (key: string) => {
			if (!stats.has(key)) stats.set(key, blank())
			return stats.get(key)!
		}

		// An interaction whose link id isn't one of THIS event's links (a stale touch, a forged
		// body) is folded into direct rather than shown as a row nobody can name.
		const resolveKey = (id: any) => {
			const k = keyOf(id)
			return k === DIRECT || linkById.has(k) ? k : DIRECT
		}

		const facets = interactionFacets[0] || { stages: [], visitors: [] }
		for (const g of facets.stages) {
			const s = statFor(resolveKey(g._id.link))
			if (g._id.type === "view") s.clicks += g.rows
			else if (g._id.type === "ticket_select") s.pickedTicket += g.sessions
			else if (g._id.type === "booking_start") s.openedCheckout += g.sessions
			else if (g._id.type === "checkout_submit") s.submittedCheckout += g.sessions
		}
		for (const g of facets.visitors) statFor(resolveKey(g._id)).visitors += g.visitors
		for (const [linkKey, v] of Array.from(verificationByLink.entries())) {
			const s = statFor(resolveKey(linkKey || null))
			s.emailCodeSent += v.codeSent
			s.emailVerified += v.verified
			s.emailNeverVerified += v.neverVerified
			s.alreadySignedIn += v.alreadySignedIn
			s.emailConfirmed += v.confirmed
		}
		for (const g of bookingGroups) {
			const s = statFor(resolveKey(g._id))
			s.bookings += g.bookings
			s.pending += g.pending
			s.buyers += (g.buyers || []).filter(Boolean).length
			s.tickets += g.tickets
			s.revenue += g.revenue
		}

		const { ReferralCodes } = await import("@/models/events/referral-codes")
		const codeIds = links.map((l) => l.referralCodeId).filter(Boolean)
		const codes = codeIds.length ? await ReferralCodes.find({ _id: { $in: codeIds } }).select("code").lean() : []
		const codeById = new Map(codes.map((c: any) => [String(c._id), String(c.code)]))

		const rows: Row[] = []
		for (const link of links.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))) {
			const key = String(link._id)
			const s = stats.get(key)
			// A deleted link stays in the report only while it has numbers to explain.
			if (link.isDeleted && !s) continue
			rows.push({
				linkId: key,
				label: link.label,
				tag: link.tag,
				platform: link.platform || null,
				state: link.isDeleted ? "deleted" : link.isActive === false ? "inactive" : "active",
				referralCode: link.referralCodeId ? codeById.get(String(link.referralCodeId)) || null : null,
				...(s || blank()),
			})
		}
		rows.push({ linkId: DIRECT, label: "Direct / no link", tag: null, platform: null, state: "direct", referralCode: null, ...(stats.get(DIRECT) || blank()) })
		for (const r of rows) r.conversion = r.visitors > 0 ? r.bookings / r.visitors : null

		if (format === "csv") {
			const headers = ["Link", "Platform", "Tag", "Status", "Clicks", "Visitors", "Picked a ticket", "Opened checkout", "Got an email code", "Verified email", "Got a code but did not verify", "Already signed in", "Submitted checkout", "Bookings", "Pending approval", "Buyers", "Tickets", "Revenue (tickets)", "Conversion %"]
			const lines = [
				headers.join(","),
				...rows.map((r) =>
					[
						r.label,
						r.state === "direct" ? "" : marketingPlatformLabel(r.platform),
						r.tag || "",
						r.state,
						r.clicks,
						r.visitors,
						r.pickedTicket,
						r.openedCheckout,
						r.emailCodeSent,
						r.emailVerified,
						r.emailNeverVerified,
						r.alreadySignedIn,
						r.submittedCheckout,
						r.bookings,
						r.pending,
						r.buyers,
						r.tickets,
						r.revenue.toFixed(2),
						r.conversion === null ? "" : (r.conversion * 100).toFixed(1),
					]
						.map(escapeCsv)
						.join(","),
				),
			]
			res.setHeader("Content-Type", "text/csv;charset=utf-8;")
			res.setHeader("Content-Disposition", `attachment; filename="marketing-links-${new Date().toISOString().slice(0, 10)}.csv"`)
			return res.status(200).send(lines.join("\n"))
		}

		return sendResponse(res, { rows }, "Marketing link report retrieved", true, ResCode.OK)
	} catch (error: any) {
		console.error("[analytics/marketing-links] Error:", error)
		return sendResponse(res, null, "Couldn't load the marketing link report.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
