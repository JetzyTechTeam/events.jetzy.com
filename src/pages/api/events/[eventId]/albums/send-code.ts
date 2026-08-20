import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { Types } from "mongoose"
import zod from "zod"
import { issueAlbumCode } from "@/lib/album-verification"
import { sendAlbumVerificationCode } from "@/lib/send-grid"
import { clientKey, isRateLimited } from "@/lib/rate-limit"

const schema = zod.object({
	email: zod.string().email(),
})

// Generous enough for a family sharing a wifi connection, tight enough that the endpoint
// isn't a free mail cannon.
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Step one of the album gate: email a 6-digit code to the address the visitor typed.
 *
 * Nothing is created here — no account, no cookie, no interest row. Those happen in
 * guest-access.ts once the code comes back, so an unverified address leaves no trace.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()

		const { eventId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, null, "Please enter a valid email address.", false, ResCode.BAD_REQUEST)
		}

		if (isRateLimited(`album-code:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
			return sendResponse(res, null, "Too many requests. Please slow down.", false, ResCode.TOO_MANY_REQUESTS)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id name").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const email = validation.data.email.trim().toLowerCase()

		const issued = await issueAlbumCode(eventId, email)
		if (!issued) {
			return sendResponse(res, null, "A code was just sent. Please wait a moment before asking for another.", false, ResCode.TOO_MANY_REQUESTS)
		}

		// Awaited, unlike most sends here: if the mail fails the visitor is left waiting for a
		// code that will never arrive, so they need to know now.
		await sendAlbumVerificationCode({ email, code: issued.code, eventName: (event as any).name })

		return sendResponse(res, { email }, "Verification code sent", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/send-code] Error:", error)
		return sendResponse(res, null, "We couldn't send the code. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
