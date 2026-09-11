import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { PremiumApplications } from "@/models/premium-applications"
import { getStripeClient, resolveStripeCustomerForUser } from "@/lib/premium"
import { resolveApplicationTrialMonths } from "@/lib/premium-application"
import { Types } from "mongoose"

/**
 * Step two: a Stripe Checkout Session in `mode: "setup"` — the same shape `api/checkout/index.ts`
 * uses to collect a card for a free-ticket-plus-free-months order (see CLAUDE.md "A FREE ticket
 * may be FREE" / the fourth session shape). No `line_items` (Stripe rejects them in setup mode)
 * and no charge: the subscription itself is only created later, by `[id]/approve.ts`, exactly
 * the way an approved ticket-bundled membership is.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	if (!session) return sendResponse(res, null, "You need to be logged in.", false, ResCode.UNAUTHORIZED)

	const userId = (session.user as any)?._id || (session.user as any)?.id
	const email = ((session.user as any)?.email || "").trim()

	try {
		const applicationId = req.body?.applicationId
		const returnTo = typeof req.body?.returnTo === "string" && req.body.returnTo.startsWith("/") ? req.body.returnTo : "/premium"

		if (!applicationId || !Types.ObjectId.isValid(applicationId)) {
			return sendResponse(res, null, "Invalid application id.", false, ResCode.BAD_REQUEST)
		}

		const application = await PremiumApplications.findById(applicationId)
		if (!application) return sendResponse(res, null, "Application not found.", false, ResCode.NOT_FOUND)

		const ownsIt = (application.userId && String(application.userId) === String(userId)) || application.email.toLowerCase() === email.toLowerCase()
		if (!ownsIt) return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)

		if (application.status !== "awaiting_card") {
			return sendResponse(res, { status: application.status }, "This application already has a card on file.", false, ResCode.BAD_REQUEST)
		}

		const stripe = getStripeClient()
		const stripeCustomerId = await resolveStripeCustomerForUser(String(userId), email)
		const trialMonths = await resolveApplicationTrialMonths(stripeCustomerId)

		application.stripeCustomerId = stripeCustomerId
		application.trialMonths = trialMonths
		await application.save()

		const baseUrl = (process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com").replace(/\/$/, "")
		const successUrl = `${baseUrl}${returnTo}?application_session_id={CHECKOUT_SESSION_ID}`
		const cancelUrl = `${baseUrl}${returnTo}?application_cancelled=1`

		const checkoutSession = await stripe.checkout.sessions.create({
			customer: stripeCustomerId,
			mode: "setup",
			payment_method_types: ["card"],
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: { applicationId: String(application._id), purpose: "premium_application" },
			setup_intent_data: { metadata: { applicationId: String(application._id), purpose: "premium_application" } },
			custom_text: {
				submit: { message: "Your card is saved for review only — nothing is charged today." },
				after_submit: {
					message: `We'll review your application and email you within 24-48 hours. If approved, your first ${trialMonths > 0 ? "month is" : "period is"} 100% free.`,
				},
			},
		})

		return sendResponse(res, { url: checkoutSession.url }, "Card setup created.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[premium/applications/checkout] Error:", error.message || error)
		return sendResponse(res, null, "Failed to start card setup.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
