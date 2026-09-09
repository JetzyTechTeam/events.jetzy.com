import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { Types } from "mongoose"
import { authOptions } from "../auth/[...nextauth]"
import { ensureDbConnected } from "@/configs/database"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { clientKey, isRateLimited } from "@/lib/rate-limit"
import { isSupportCategory } from "@/lib/support"
import { Events } from "@/models/events"
import { SupportRequest } from "@/models/support-request"
import { sendSupportRequestNotice, sendSupportRequestReceived } from "@/lib/send-grid"

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 10 * 60_000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	await ensureDbConnected()

	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "Not authenticated", false, ResCode.UNAUTHORIZED)
		}

		if (isRateLimited(`support:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
			return sendResponse(res, null, "Too many requests. Please slow down.", false, ResCode.TOO_MANY_REQUESTS)
		}

		const name = (req.body?.name as string)?.trim()?.slice(0, 100)
		const category = req.body?.category as string
		const message = (req.body?.message as string)?.trim()?.slice(0, 3000)
		const rawEventId = req.body?.eventId as string | undefined

		if (!name) {
			return sendResponse(res, null, "Please tell us your name.", false, ResCode.BAD_REQUEST)
		}
		if (!isSupportCategory(category)) {
			return sendResponse(res, null, "Please pick a valid category.", false, ResCode.BAD_REQUEST)
		}
		if (!message) {
			return sendResponse(res, null, "Please describe your question.", false, ResCode.BAD_REQUEST)
		}

		const email = ((session.user as any)?.email as string)?.trim()
		if (!email) {
			return sendResponse(res, null, "Your account has no email on file.", false, ResCode.BAD_REQUEST)
		}

		let eventName: string | undefined
		let eventSlug: string | undefined
		let eventId: string | undefined

		if (rawEventId) {
			if (!Types.ObjectId.isValid(rawEventId)) {
				return sendResponse(res, null, "That event could not be found.", false, ResCode.BAD_REQUEST)
			}
			// Never trust the client here: a private event must never reach an admin's inbox as
			// something a stranger was allowed to pick from a dropdown, regardless of what the
			// browser sent.
			const event = await Events.findOne({ _id: rawEventId, isDeleted: false, privacy: { $ne: "private" } }, "name slug").lean()
			if (!event) {
				return sendResponse(res, null, "That event could not be found.", false, ResCode.BAD_REQUEST)
			}
			eventId = String((event as any)._id)
			eventName = (event as any).name
			eventSlug = (event as any).slug
		}

		const userId = (session.user as any)?._id || (session.user as any)?.id

		const doc = await SupportRequest.create({
			userId,
			name,
			email,
			category,
			eventId,
			eventName,
			eventSlug,
			message,
			status: "open",
		})

		sendSupportRequestReceived({ email, name, category, eventName, message }).catch((e) =>
			console.error("support request confirmation failed", e),
		)
		sendSupportRequestNotice({ name, email, category, eventName, eventSlug, message }).catch((e) =>
			console.error("support request notice failed", e),
		)

		return sendResponse(res, { id: String(doc._id) }, "Support request submitted", true, ResCode.OK)
	} catch (error: any) {
		console.error("[support/submit] Failed:", error)
		return sendResponse(res, null, `Failed to submit support request: ${error.message}`, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
