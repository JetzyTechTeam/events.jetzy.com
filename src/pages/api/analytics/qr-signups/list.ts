import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { EventUsers } from "@/models/eventUsersModal"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { QR_SIGNUP_SOURCE, buildDateFilter, escapeCsv, escapeRegex, qrSourceMatch } from "@/lib/qrSignups"

// Explicit allowlist — never project password, tokens or verification codes.
const PROJECTION = {
	email: 1,
	firstName: 1,
	lastName: 1,
	location: 1,
	latitude: 1,
	longitude: 1,
	placeId: 1,
	refCode: 1,
	authProvider: 1,
	image: 1,
	isVerified: 1,
	emailBounced: 1,
	isBlocked: 1,
	createdAt: 1,
	signupSource: 1,
	signupSessionId: 1,
} as const

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
		// This endpoint exposes signup PII — admin only, no owner-level access.
		if (!isAdmin) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)

		const { dateFrom, dateTo, search, source = "qr", provider, hasRefCode, format } = req.query as Record<string, string>
		const pageNum = Math.max(1, parseInt((req.query.page as string) || "1", 10) || 1)
		const limitNum = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "25", 10) || 25))

		const and: any[] = []
		if (source !== "all") and.push(qrSourceMatch)

		const dateFilter = buildDateFilter(dateFrom, dateTo)
		if (dateFilter) and.push({ createdAt: dateFilter })

		if (search?.trim()) {
			const rx = new RegExp(escapeRegex(search.trim()), "i")
			and.push({ $or: [{ email: rx }, { location: rx }, { firstName: rx }, { refCode: rx }] })
		}

		if (provider) and.push({ authProvider: provider })

		if (hasRefCode === "true") and.push({ refCode: { $exists: true, $ne: "" } })
		else if (hasRefCode === "false") and.push({ $or: [{ refCode: { $exists: false } }, { refCode: "" }] })

		const match = and.length ? { $and: and } : {}

		const shape = (d: any) => {
			// Legacy row with no marker but with location data => inferred QR.
			// Legacy row with neither => genuinely unknown.
			const isInferred = !d.signupSource && !!(d.location || d.placeId)
			const resolvedSource = d.signupSource || (isInferred ? QR_SIGNUP_SOURCE : "unknown")
			return {
				_id: d._id?.toString(),
				email: d.email ?? "",
				name: [d.firstName, d.lastName].filter(Boolean).join(" ").trim(),
				location: d.location ?? "",
				latitude: typeof d.latitude === "number" ? d.latitude : null,
				longitude: typeof d.longitude === "number" ? d.longitude : null,
				placeId: d.placeId ?? "",
				refCode: d.refCode ?? "",
				authProvider: d.authProvider || "credentials",
				isVerified: !!d.isVerified,
				emailBounced: !!d.emailBounced,
				isBlocked: !!d.isBlocked,
				createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
				signupSource: resolvedSource,
				signupSessionId: d.signupSessionId ?? "",
				isInferred,
			}
		}

		// CSV export covers the FULL filtered set, ignoring pagination.
		if (format === "csv") {
			const docs = await EventUsers.find(match, PROJECTION).sort({ createdAt: -1 }).limit(50000).lean()
			const rows = docs.map(shape)
			const headers = ["Signed Up", "Email", "Name", "Location", "Latitude", "Longitude", "Place ID", "Invite Code", "Provider", "Source", "Verified", "Bounced", "Blocked"]
			const lines = [
				headers.join(","),
				...rows.map((r) =>
					[
						r.createdAt || "",
						r.email,
						r.name,
						r.location,
						r.latitude ?? "",
						r.longitude ?? "",
						r.placeId,
						r.refCode,
						r.authProvider,
						r.isInferred ? `${r.signupSource} (inferred)` : r.signupSource,
						r.isVerified ? "yes" : "no",
						r.emailBounced ? "yes" : "no",
						r.isBlocked ? "yes" : "no",
					]
						.map(escapeCsv)
						.join(",")
				),
			]
			res.setHeader("Content-Type", "text/csv;charset=utf-8;")
			res.setHeader("Content-Disposition", `attachment; filename="qr-signups-${new Date().toISOString().slice(0, 10)}.csv"`)
			return res.status(200).send(lines.join("\n"))
		}

		const [docs, total] = await Promise.all([
			EventUsers.find(match, PROJECTION)
				.sort({ createdAt: -1 })
				.skip((pageNum - 1) * limitNum)
				.limit(limitNum)
				.lean(),
			EventUsers.countDocuments(match),
		])

		return sendResponse(res, { rows: docs.map(shape), total, page: pageNum, limit: limitNum }, "QR signups retrieved", true, ResCode.OK)
	} catch (error: any) {
		console.error("[QR Signups List] Error:", error)
		return sendResponse(res, null, error.message || "Failed", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
