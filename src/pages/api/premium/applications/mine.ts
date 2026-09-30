import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { PremiumApplications } from "@/models/premium-applications"

/** The signed-in buyer's own latest application, so a repeat visit shows the review screen instead of the buy card. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	if (!session) return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)

	const userId = (session.user as any)?._id?.toString()
	const email = ((session.user as any)?.email || "").trim()

	const application = await PremiumApplications.findOne({
		$or: [...(userId ? [{ userId }] : []), ...(email ? [{ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }] : [])],
	}).sort({ createdAt: -1 })

	return sendResponse(res, application || null, "OK", true, ResCode.OK)
}
