// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sortEvents } from "@/utils/eventSort"
import { escapeRegExp } from "@/utils/text"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		await ensureDbConnected()

		const session = await getServerSession(req, res, authOptions)
		const role = (session?.user as any)?.role
		const name = (session?.user as any)?.name || (session?.user as any)?.fullName
		const isAdmin =
			role === "admin" ||
			role === "super admin" ||
			name?.toLowerCase() === "super admin"

		const search = (req.query.search as string)?.trim() || ""
		const filter: any = { isDeleted: false, status: { $ne: 'draft' } }
		if (!isAdmin) filter.privacy = { $ne: 'private' }
		if (search) {
			const searchRegex = escapeRegExp(search)
			const orClauses: any[] = [
				{ name: { $regex: searchRegex, $options: "i" } },
				{ location: { $regex: searchRegex, $options: "i" } },
				{ "host.name": { $regex: searchRegex, $options: "i" } },
				{ benefits: { $regex: searchRegex, $options: "i" } },
			]

			// Try to resolve interest IDs from the Jetzy API by name (best-effort, no auth)
			try {
				const externalBase = process.env.NEXT_PUBLIC_EXTERNAL_API_BASE_URL || "https://test.jetzy.com"
				const interestRes = await fetch(
					`${externalBase}/api/v1/interests/bulk-categories?perPage=10000&page=1&search=`,
					{ headers: { "Content-Type": "application/json", Accept: "application/json" } }
				)
				if (interestRes.ok) {
					const interestData = await interestRes.json()
					const categories: any[] = interestData?.data?.data ?? []
					const matchingIds: string[] = []
					const lc = search.toLowerCase()
					for (const cat of categories) {
						if (cat.name?.toLowerCase().includes(lc)) {
							matchingIds.push(cat._id)
							;(cat.subCategories ?? []).forEach((s: any) => matchingIds.push(s.id))
						}
						for (const sub of cat.subCategories ?? []) {
							if (sub.name?.toLowerCase().includes(lc)) matchingIds.push(sub.id)
						}
					}
					if (matchingIds.length > 0) orClauses.push({ interests: { $in: matchingIds } })
				}
			} catch (_) {
				// external API unavailable — interest name search skipped
			}

			filter.$or = orClauses
		}

		const events = await Events.find(filter).lean()

		// Canonical order: live -> future -> tbd -> past (see src/utils/eventSort.ts)
		const sortedEvents = sortEvents(events)

		const LIMIT = 20
		const page = Math.max(1, parseInt(req.query.page as string) || 1)
		const total = sortedEvents.length
		const totalPages = Math.ceil(total / LIMIT)
		const skip = (page - 1) * LIMIT
		const paginated = sortedEvents.slice(skip, skip + LIMIT)

		return res.status(200).json({
			data: paginated,
			pagination: { total, page, showing: paginated.length, limit: LIMIT, totalPages },
			message: "Events retrieved successfully!",
			status: true,
		})
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
