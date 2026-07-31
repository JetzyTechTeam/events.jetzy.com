import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { findUserRecord } from "@/lib/premium"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)

	if (!session) {
		return sendResponse(res, null, "You need to be logged in.", false, ResCode.UNAUTHORIZED)
	}

	try {
		const userId = (session.user as any)?._id || (session.user as any)?.id
		const record = await findUserRecord(userId)

		const premiumSubscription = record?.doc?.premiumSubscription || { active: false }

		return sendResponse(res, { premiumSubscription }, "Subscription status fetched.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[subscriptions/me] Error:", error.message || error)
		return sendResponse(res, null, "Failed to fetch subscription status.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
