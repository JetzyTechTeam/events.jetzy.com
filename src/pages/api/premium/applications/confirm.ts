import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { PremiumApplications } from "@/models/premium-applications"
import { fulfillApplicationSetupSession } from "@/lib/premium-application"

// Fast path for immediate UI feedback right after Stripe redirects back from the card-setup
// session — the webhook (`checkout.session.completed` in `api/webhooks/stripe.ts`) is the
// authoritative path and calls the same idempotent fulfilment function.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	if (!session) return sendResponse(res, null, "You need to be logged in.", false, ResCode.UNAUTHORIZED)

	const { session_id } = req.query
	if (!session_id || typeof session_id !== "string") {
		return sendResponse(res, null, "Invalid session ID", false, ResCode.BAD_REQUEST)
	}

	try {
		await fulfillApplicationSetupSession(session_id)

		const userId = (session.user as any)?._id?.toString()
		const email = ((session.user as any)?.email || "").trim()
		// Scoped to the signed-in buyer, never the bare newest row — otherwise a race between two
		// buyers confirming at once could hand one of them the other's application.
		const application = await PremiumApplications.findOne({
			$or: [...(userId ? [{ userId }] : []), ...(email ? [{ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }] : [])],
		}).sort({ createdAt: -1 })
		return sendResponse(res, application, "Confirmed.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[premium/applications/confirm] Error:", error.message || error)
		return sendResponse(res, null, "Failed to confirm.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
