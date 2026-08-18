import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { buildDateFilter, escapeCsv, escapeRegex } from "@/lib/qrSignups"
import { TRIAL_CODES } from "@/lib/invite-trial"

/**
 * Who signed up with a membership invite code — and whether they actually got it.
 *
 * `membership_purchases` alone can't answer this. It records the moment a membership is CREATED,
 * which for a signup code is after the verification link is followed; someone who typed the code
 * and never opened their email is invisible there, and they are exactly who a campaign report
 * needs to show. So this reads the SIGNUP side — `EventUsers.refCode` — and joins the grant onto
 * it, leaving the gap between "typed it" and "got it" visible rather than silently trimmed.
 *
 * The join is by EMAIL, not by user id: a person can hold an account document in either
 * collection, and the grant is recorded against the address (see `findMembershipRecord`).
 *
 * ADMIN ONLY — a list of people with their email addresses.
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

		const { EventUsers } = await import("@/models/eventUsersModal")
		const { MembershipPurchases } = await import("@/models/events/membership-purchases")

		const { dateFrom, dateTo, code, status, search, format } = req.query as Record<string, string>
		const pageNum = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1)
		const limitNum = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "25", 10) || 25))

		// Only the codes that actually grant membership. A referral code that credits somebody
		// else lives in the same field and is a different report entirely.
		const trialCodes = Object.keys(TRIAL_CODES)
		const wanted = code && trialCodes.includes(code.toLowerCase()) ? [code.toLowerCase()] : trialCodes
		if (wanted.length === 0) {
			return sendResponse(res, { rows: [], total: 0, page: 1, limit: limitNum, summary: { typed: 0, verified: 0, granted: 0, pending: 0 }, byCode: [] }, "No trial codes configured", true, ResCode.OK)
		}

		const and: any[] = [{ refCode: { $in: wanted.map((c) => new RegExp(`^${escapeRegex(c)}$`, "i")) } }]

		const dateFilter = buildDateFilter(dateFrom, dateTo)
		if (dateFilter) and.push({ createdAt: dateFilter })

		if (search?.trim()) {
			const rx = new RegExp(escapeRegex(search.trim()), "i")
			and.push({ $or: [{ email: rx }, { firstName: rx }, { lastName: rx }] })
		}

		// `emailVerified` is only written by the link flow; `/jetzyqrsignup` creates a usable
		// account outright, so it is treated as verified rather than reported as a dead lead.
		if (status === "verified") and.push({ $or: [{ emailVerified: true }, { signupSource: "jetzyqrsignup" }] })
		else if (status === "unverified") and.push({ emailVerified: { $ne: true }, signupSource: { $ne: "jetzyqrsignup" } })

		const match = { $and: and }

		const shape = async (docs: any[]) => {
			const emails = docs.map((d) => String(d.email || "").toLowerCase()).filter(Boolean)
			// One query for the whole page, matched case-insensitively — neither collection
			// declares `lowercase: true` on email.
			const grants = emails.length
				? await MembershipPurchases.find({
					key: "premium",
					email: { $in: emails.map((e) => new RegExp(`^${escapeRegex(e)}$`, "i")) },
				})
					.select("email source inviteCode trialMonths trialEndsAt stripeSubscriptionId createdAt")
					.lean()
				: []
			const grantByEmail = new Map(grants.map((g: any) => [String(g.email || "").toLowerCase(), g]))

			return docs.map((d: any) => {
				const email = String(d.email || "")
				const grant: any = grantByEmail.get(email.toLowerCase())
				const verified = !!d.emailVerified || d.signupSource === "jetzyqrsignup"
				return {
					_id: String(d._id),
					email,
					name: [d.firstName, d.lastName].filter(Boolean).join(" ").trim(),
					code: String(d.refCode || "").toLowerCase(),
					signupSource: d.signupSource || "signup",
					signedUpAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
					verified,
					// The membership itself. Absent means the code was typed but never redeemed —
					// usually an unopened verification email.
					granted: !!grant,
					grantedAt: grant?.createdAt ? new Date(grant.createdAt).toISOString() : null,
					trialMonths: grant?.trialMonths || 0,
					trialEndsAt: grant?.trialEndsAt ? new Date(grant.trialEndsAt).toISOString() : null,
					grantSource: grant?.source || "",
					stripeSubscriptionId: grant?.stripeSubscriptionId || "",
				}
			})
		}

		if (format === "csv") {
			const docs = await EventUsers.find(match)
				.select("email firstName lastName refCode signupSource emailVerified createdAt")
				.sort({ createdAt: -1 })
				.limit(50000)
				.lean()
			const rows = await shape(docs)
			const headers = ["Signed Up", "Name", "Email", "Code", "Signup Route", "Verified", "Membership Granted", "Granted At", "Free Months", "Free Until"]
			const lines = [
				headers.join(","),
				...rows.map((r) =>
					[
						r.signedUpAt || "", r.name, r.email, r.code, r.signupSource, r.verified ? "yes" : "no",
						r.granted ? "yes" : "no", r.grantedAt || "", r.trialMonths || "", r.trialEndsAt || "",
					]
						.map(escapeCsv)
						.join(","),
				),
			]
			res.setHeader("Content-Type", "text/csv;charset=utf-8;")
			res.setHeader("Content-Disposition", `attachment; filename="signup-invite-codes-${new Date().toISOString().slice(0, 10)}.csv"`)
			return res.status(200).send(lines.join("\n"))
		}

		const [docs, total, byCodeRaw] = await Promise.all([
			EventUsers.find(match)
				.select("email firstName lastName refCode signupSource emailVerified createdAt")
				.sort({ createdAt: -1 })
				.skip((pageNum - 1) * limitNum)
				.limit(limitNum)
				.lean(),
			EventUsers.countDocuments(match),
			EventUsers.aggregate([{ $match: match }, { $group: { _id: { $toLower: "$refCode" }, typed: { $sum: 1 } } }, { $sort: { typed: -1 } }]),
		])

		const rows = await shape(docs)

		// Counted across the WHOLE filtered set, not the page — a funnel that only describes 25
		// rows is worse than no funnel.
		const [verifiedCount, grantedCount] = await Promise.all([
			EventUsers.countDocuments({ $and: [...and, { $or: [{ emailVerified: true }, { signupSource: "jetzyqrsignup" }] }] }),
			MembershipPurchases.countDocuments({ key: "premium", source: "signup", ...(dateFilter ? { createdAt: dateFilter } : {}) }),
		])

		return sendResponse(
			res,
			{
				rows,
				total,
				page: pageNum,
				limit: limitNum,
				summary: {
					typed: total,
					verified: verifiedCount,
					granted: grantedCount,
					// Typed the code, never finished — the number worth chasing with a reminder.
					pending: Math.max(0, total - grantedCount),
				},
				byCode: byCodeRaw.map((row: any) => ({ code: row._id, typed: row.typed })),
			},
			"Signup invite codes retrieved",
			true,
			ResCode.OK,
		)
	} catch (error: any) {
		console.error("[analytics/signup-trials] Error:", error)
		return sendResponse(res, null, error.message || "Failed to build the signup invite report", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
