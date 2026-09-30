import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { ReferralCodes } from "@/models/events/referral-codes"
import { Types } from "mongoose"
import { REFERRAL_NOT_FOR_SELECTION_MESSAGE, selectionHasEligibleTicket } from "@/lib/referral-ticket-scope"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		if (req.method !== "POST") {
			return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
		}

		const { eventId, code } = req.body

		if (!eventId || !code) {
			return sendResponse(res, null, "Event ID and referral code are required", false, ResCode.BAD_REQUEST)
		}

		const { ensureDbConnected } = await import("@/configs/database")
		await ensureDbConnected()

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

		// Scoped to particular tickets? Refuse when none of the selected ones qualify, with the
		// same message checkout would give. `ticketIds` in the body is optional — an older
		// client that doesn't send it still gets the preview, and checkout re-checks anyway.
		const scopedTicketIds =
			Array.isArray(referralCode.ticketIds) && referralCode.ticketIds.length > 0 ? referralCode.ticketIds.map(String) : undefined
		if (Array.isArray(req.body?.ticketIds) && !selectionHasEligibleTicket({ ticketIds: scopedTicketIds }, req.body.ticketIds)) {
			return sendResponse(res, null, REFERRAL_NOT_FOR_SELECTION_MESSAGE, false, ResCode.BAD_REQUEST)
		}

		// Return valid referral code data (without sensitive info)
		return sendResponse(
			res,
			{
				code: referralCode.code,
				// Absent = every ticket. The modal uses it to discount only the eligible tickets.
				...(scopedTicketIds ? { ticketIds: scopedTicketIds } : {}),
				discountPercentage: referralCode.discountPercentage,
				// So the checkout modal can say what the code is worth BEFORE the buyer commits.
				// A code that gives free membership months but no percentage would otherwise
				// preview as "0% off" — which reads as a code that does nothing.
				freeMembershipMonths: referralCode.freeMembershipMonths || 0,
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
