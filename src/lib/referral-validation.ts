import { Types } from "mongoose"

/**
 * Server-side referral-code validation, shared by every checkout path.
 *
 * `/api/events/[eventId]/referral-codes/validate` is a public PREVIEW for the checkout modal
 * and proves nothing — the code can be deactivated, deleted or exhausted between the moment
 * the modal turns green and the moment the buyer submits. Both checkout endpoints therefore
 * re-validate here, and this is the only implementation of that check.
 *
 * Returns a result rather than writing a response, so callers keep their own status codes.
 */

export type ReferralValidationResult =
	| { ok: true; data: { code: string; discountPercentage: number; freeMembershipMonths: number } | null }
	| { ok: false; message: string }

export async function validateReferralCodeForEvent(
	eventId: string | undefined,
	rawCode: string | undefined | null,
): Promise<ReferralValidationResult> {
	const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : ""

	// No code supplied is not an error — it's just no discount.
	if (!code) return { ok: true, data: null }

	if (!eventId || !Types.ObjectId.isValid(eventId)) {
		return { ok: false, message: "Invalid event ID" }
	}

	const { ReferralCodes } = await import("@/models/events/referral-codes")

	const codeRecord = await ReferralCodes.findOne({
		eventId: new Types.ObjectId(eventId),
		code,
		isDeleted: false,
		isActive: true,
	})

	if (!codeRecord) {
		return { ok: false, message: "Invalid or inactive referral code" }
	}

	// `maxUses` of null/undefined means unlimited — check for both, not just null.
	if (codeRecord.maxUses !== null && codeRecord.maxUses !== undefined && codeRecord.usageCount >= codeRecord.maxUses) {
		return { ok: false, message: "Referral code has reached maximum uses" }
	}

	return {
		ok: true,
		data: {
			code: codeRecord.code,
			discountPercentage: codeRecord.discountPercentage,
			// Absent on every code created before this existed, which is the same as none.
			freeMembershipMonths: codeRecord.freeMembershipMonths || 0,
		},
	}
}
