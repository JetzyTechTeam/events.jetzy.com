import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { PremiumApplications } from "@/models/premium-applications"
import { getMembershipPrice, findMembershipPriceForInterval } from "@/lib/premium"
import { startMembershipSubscription } from "@/lib/membership-subscriptions"
import { sendMembershipStarted } from "@/lib/send-grid"
import { MEMBERSHIPS } from "@/lib/memberships"

/**
 * Approve: the applicant's first month is free exactly the way any other "first month free"
 * Premium signup is — `startMembershipSubscription` with the stored `trialMonths`, same call
 * `bookings/approve.ts` makes for an approved ticket-bundled membership. Nothing is charged
 * until the trial ends; the email is the existing `sendMembershipStarted` welcome, which already
 * knows how to say "free until <date>, then $X/interval".
 */
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
	const application = await PremiumApplications.findById(id)
	if (!application) return sendResponse(res, null, "Application not found.", false, ResCode.NOT_FOUND)
	if (application.status !== "under_review") {
		return sendResponse(res, null, "This application is not awaiting review.", false, ResCode.BAD_REQUEST)
	}
	if (!application.stripeCustomerId || !application.paymentMethodId) {
		return sendResponse(res, null, "No card on file for this application.", false, ResCode.BAD_REQUEST)
	}

	try {
		const price =
			application.interval === "year"
				? (await findMembershipPriceForInterval("premium", "year")) || (await getMembershipPrice("premium"))
				: await getMembershipPrice("premium")

		const result = await startMembershipSubscription({
			key: "premium",
			priceId: price.id,
			interval: application.interval,
			customerId: application.stripeCustomerId,
			paymentMethodId: application.paymentMethodId,
			email: application.email,
			name: application.name,
			subscriberId: application.userId ? String(application.userId) : undefined,
			trialMonths: application.trialMonths || 0,
			source: "application",
			metadata: { applicationId: String(application._id) },
		})

		application.status = "approved"
		application.reviewedAt = new Date()
		application.reviewedBy = adminId
		if (result.subscriptionId) application.stripeSubscriptionId = result.subscriptionId
		await application.save()

		if (result.created && price.unit_amount != null) {
			try {
				await sendMembershipStarted({
					email: application.email,
					firstName: application.name,
					amount: price.unit_amount / 100,
					interval: price.recurring?.interval || application.interval,
					label: MEMBERSHIPS.premium.label,
					...(result.firstRenewalAt ? { trialEndsOn: result.firstRenewalAt, nextBillingDate: result.firstRenewalAt } : {}),
					endsWithoutCard: false,
				})
			} catch (emailError) {
				console.error("[premium/applications/approve] Approved but could not send the welcome email:", emailError)
			}
		}

		try {
			const { sendPremiumApplicationAdminNotice } = await import("@/lib/send-grid")
			await sendPremiumApplicationAdminNotice({ kind: "approved", email: application.email, name: application.name, interval: application.interval })
		} catch {}

		return sendResponse(res, application, "Application approved.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[premium/applications/approve] Error:", error.message || error)
		return sendResponse(res, null, `Could not start the membership: ${error.message || "unknown error"}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
