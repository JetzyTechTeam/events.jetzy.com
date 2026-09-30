import { Types } from "mongoose"
import { REFERRAL_NOT_FOR_SELECTION_MESSAGE, selectionHasEligibleTicket } from "@/lib/referral-ticket-scope"

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

export type ReferralCodeData = {
	code: string
	discountPercentage: number
	freeMembershipMonths: number
	/** Absent = every ticket. See `src/lib/referral-ticket-scope.ts`. */
	ticketIds?: string[]
}

export type ReferralValidationResult =
	| { ok: true; data: ReferralCodeData | null }
	| { ok: false; message: string }

export async function validateReferralCodeForEvent(
	eventId: string | undefined,
	rawCode: string | undefined | null,
	/**
	 * The tickets in the order. When supplied, a code scoped to other tickets is refused — a
	 * silent 0% would read to the buyer as a broken code.
	 */
	selectedTicketIds?: Array<string | undefined | null>,
): Promise<ReferralValidationResult> {
	const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : ""

	// No code supplied is not an error — it's just no discount.
	if (!code) return { ok: true, data: null }

	if (!eventId || !Types.ObjectId.isValid(eventId)) {
		return { ok: false, message: "Invalid event ID" }
	}

	const { ensureDbConnected } = await import("@/configs/database")
	await ensureDbConnected()
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

	const ticketIds = Array.isArray(codeRecord.ticketIds) && codeRecord.ticketIds.length > 0 ? codeRecord.ticketIds.map(String) : undefined

	if (selectedTicketIds && !selectionHasEligibleTicket({ ticketIds }, selectedTicketIds)) {
		return { ok: false, message: REFERRAL_NOT_FOR_SELECTION_MESSAGE }
	}

	return {
		ok: true,
		data: {
			code: codeRecord.code,
			discountPercentage: codeRecord.discountPercentage,
			// Absent on every code created before this existed, which is the same as none.
			freeMembershipMonths: codeRecord.freeMembershipMonths || 0,
			...(ticketIds ? { ticketIds } : {}),
		},
	}
}
