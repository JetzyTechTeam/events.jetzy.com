import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { PremiumApplications } from "@/models/premium-applications"
import { getStripeClient } from "@/lib/premium"
import { sendPremiumApplicationRejected, sendPremiumApplicationAdminNotice } from "@/lib/send-grid"

// No refund needed — nothing was ever charged (the Stripe session was `mode: "setup"`). The
// saved card is detached so it can't be billed later by anything, best-effort.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	const userRole = (session?.user as any)?.role
	const adminId = (session?.user as any)?._id?.toString()
	const isAdmin = userRole === "admin" || userRole === "super admin"
	if (!session) return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
	if (!isAdmin) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)

	const { id } = req.query
	const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 1000) : undefined

	const application = await PremiumApplications.findById(id)
	if (!application) return sendResponse(res, null, "Application not found.", false, ResCode.NOT_FOUND)
	if (application.status !== "under_review") {
		return sendResponse(res, null, "This application is not awaiting review.", false, ResCode.BAD_REQUEST)
	}

	application.status = "rejected"
	application.reviewedAt = new Date()
	application.reviewedBy = adminId
	if (reason) application.rejectionReason = reason
	await application.save()

	if (application.paymentMethodId) {
		try {
			await getStripeClient().paymentMethods.detach(application.paymentMethodId)
		} catch (detachError) {
			console.error("[premium/applications/reject] Could not detach the saved card:", detachError)
		}
	}

	try {
		await sendPremiumApplicationRejected({ email: application.email, name: application.name, reason })
	} catch (emailError) {
		console.error("[premium/applications/reject] Could not send the rejection email:", emailError)
	}
	try {
		await sendPremiumApplicationAdminNotice({ kind: "rejected", email: application.email, name: application.name, interval: application.interval })
	} catch {}

	return sendResponse(res, application, "Application rejected.", true, ResCode.OK)
}
