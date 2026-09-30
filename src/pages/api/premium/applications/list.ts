import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { PremiumApplications } from "@/models/premium-applications"

/** Admin queue: `?scope=pending` (under_review) or `?scope=processed` (approved|rejected). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	const userRole = (session?.user as any)?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"
	if (!session) return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
	if (!isAdmin) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)

	const scope = req.query.scope === "processed" ? "processed" : "pending"
	const filter = scope === "pending" ? { status: { $in: ["under_review"] } } : { status: { $in: ["approved", "rejected"] } }

	const applications = await PremiumApplications.find(filter)
		.sort(scope === "pending" ? { createdAt: 1 } : { reviewedAt: -1 })
		.limit(200)

	return sendResponse(res, applications, "OK", true, ResCode.OK)
}
