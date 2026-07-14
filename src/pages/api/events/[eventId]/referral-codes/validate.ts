import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ReferralCodes } from "@/models/events/referral-codes"
import { Types } from "mongoose"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		if (req.method !== "POST") {
			return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
		}

		const { eventId, code } = req.body

		if (!eventId || !code) {
			return sendResponse(res, null, "Event ID and referral code are required", false, ResCode.BAD_REQUEST)
		}

		// Ensure database connection
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			await dbconn.asPromise()
		}

		// Find referral code
		const referralCode = await ReferralCodes.findOne({
			eventId: new Types.ObjectId(eventId),
			code: code.trim().toUpperCase(),
			isDeleted: false,
			isActive: true,
		})

		if (!referralCode) {
			return sendResponse(res, null, "Invalid or inactive referral code", false, ResCode.NOT_FOUND)
		}

		// Check if code has reached max uses
		if (referralCode.maxUses != null && referralCode.usageCount >= referralCode.maxUses) {
			return sendResponse(res, null, "Referral code has reached maximum uses", false, ResCode.BAD_REQUEST)
		}

		// Return valid referral code data (without sensitive info)
		return sendResponse(
			res,
			{
				code: referralCode.code,
				discountPercentage: referralCode.discountPercentage,
				isValid: true,
			},
			"Referral code is valid",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("[referral-codes/validate] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
