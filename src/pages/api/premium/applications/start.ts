import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { PremiumApplications } from "@/models/premium-applications"
import { findMembershipRecord } from "@/lib/premium"
import { getApplicationSettings, missingRequiredAnswers } from "@/lib/premium-application"
import zod from "zod"

const schema = zod.object({
	interval: zod.enum(["month", "year"]).default("month"),
	answers: zod.record(zod.any()).default({}),
})

/**
 * Step one of the application: record the questionnaire answers and hand back an id for
 * `checkout.ts` to attach the (not-yet-collected) card to.
 *
 * Idempotent-ish: a buyer who already has a live application (`awaiting_card` / `under_review`)
 * gets that one back rather than a duplicate — a double-click or a re-opened tab must not spawn
 * two rows an admin then has to reconcile.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	if (!session) return sendResponse(res, null, "You need to be logged in to apply.", false, ResCode.UNAUTHORIZED)

	const userId = (session.user as any)?._id || (session.user as any)?.id
	const email = ((session.user as any)?.email || "").trim()
	if (!email) return sendResponse(res, null, "No email on this account.", false, ResCode.BAD_REQUEST)

	const settings = await getApplicationSettings()
	if (!settings.enabled) return sendResponse(res, null, "Applications aren't open right now.", false, ResCode.BAD_REQUEST)

	const record = await findMembershipRecord(userId, email)
	if (record?.doc?.premiumSubscription?.active) {
		return sendResponse(res, { alreadySubscribed: true }, "You already have an active Jetzy Premium subscription.", false, ResCode.BAD_REQUEST)
	}

	const parsed = schema.safeParse(req.body)
	if (!parsed.success) return sendResponse(res, null, "Invalid input.", false, ResCode.BAD_REQUEST)
	const { interval, answers } = parsed.data

	const missing = missingRequiredAnswers(settings.questions, answers)
	if (missing.length > 0) {
		return sendResponse(res, { missing }, `Please answer: ${missing.join(", ")}`, false, ResCode.BAD_REQUEST)
	}

	const existing = await PremiumApplications.findOne({
		$or: [...(userId ? [{ userId }] : []), { email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }],
		status: { $in: ["awaiting_card", "under_review"] },
	}).sort({ createdAt: -1 })
	if (existing) {
		return sendResponse(res, { applicationId: existing._id, status: existing.status }, "You already have an application in progress.", true, ResCode.OK)
	}

	const answerRows = Object.entries(answers)
		.filter(([, value]) => value !== undefined && value !== null && value !== "")
		.map(([questionId, answer]) => ({ questionId, answer }))

	const application = await PremiumApplications.create({
		userId,
		email,
		name: (session.user as any)?.name || undefined,
		interval,
		answers: answerRows,
		status: "awaiting_card",
	})

	return sendResponse(res, { applicationId: application._id }, "Application started.", true, ResCode.OK)
}
