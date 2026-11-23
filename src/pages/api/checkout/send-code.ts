import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ensureDbConnected } from "@/configs/database"
import { issueAlbumCode } from "@/lib/album-verification"
import { sendPremiumVerificationCode } from "@/lib/send-grid"
import { clientKey, isRateLimited } from "@/lib/rate-limit"
import { sendBackendLoginCode } from "@/lib/backend-login-code"
import zod from "zod"

const schema = zod.object({ email: zod.string().email() })

const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

/**
 * Ticket checkout, step one of proving the buyer's address (CEO, 2026-11-18): email a 6-digit code
 * to the address typed in the checkout form.
 *
 * Nothing is created here — no account, no session, no booking. The account is created by
 * `verify-code` (the backend's login code creates it when the address has none), so an address
 * nobody controls leaves no trace.
 *
 * Same shape as `api/premium/send-code.ts`: the BACKEND's login code first, our own code store only
 * when the backend is unreachable. Never reveals whether the address already has an account.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, null, "Please enter a valid email address.", false, ResCode.BAD_REQUEST)
		}

		if (isRateLimited(`ticket-code:${clientKey(req)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
			return sendResponse(res, null, "Too many requests. Please slow down.", false, ResCode.TOO_MANY_REQUESTS)
		}

		const email = validation.data.email.trim().toLowerCase()

		// The backend maps a purpose it doesn't know to its neutral "login" email, so "ticket" is safe.
		const sent = await sendBackendLoginCode(email, "ticket")
		if (sent.ok) {
			return sendResponse(res, { sent: true, via: "jetzy" }, "We've emailed you a code.", true, ResCode.OK)
		}
		if ("rateLimited" in sent) {
			return sendResponse(res, null, "A code was just sent. Please wait a moment before asking for another.", false, ResCode.TOO_MANY_REQUESTS)
		}
		if (!("unavailable" in sent)) {
			return sendResponse(res, null, sent.message || "We couldn't send that code. Please check the address and try again.", false, ResCode.BAD_REQUEST)
		}
		console.warn(`[checkout/send-code] backend login code unavailable (${sent.status ?? "network"}), using our own code`)

		const issued = await issueAlbumCode(null, email, "ticket")
		if (!issued) {
			return sendResponse(res, null, "A code was just sent. Please wait a moment before asking for another.", false, ResCode.TOO_MANY_REQUESTS)
		}

		// A plain "here is your code" email — it says nothing about Premium.
		await sendPremiumVerificationCode({ email, code: issued.code })

		return sendResponse(res, { sent: true, via: "portal" }, "We've emailed you a code.", true, ResCode.OK)
	} catch (error: any) {
		console.error("[checkout/send-code] Error:", error?.message || error)
		return sendResponse(res, null, "We couldn't send that code. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
