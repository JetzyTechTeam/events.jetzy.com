import { Types } from "mongoose"

/**
 * Referral codes every ADMIN-created event starts with (CEO, 2026-09-15).
 *
 * Both give free months of Jetzy Premium and no discount, on every ticket — the months only
 * take effect on a ticket that sells Premium (`resolveFreeMonthsForKey`), so a ticket that
 * doesn't is unaffected. Hosts can edit or delete them like any other code.
 *
 * Not the same thing as the `TRIAL_CODES` invite codes of the same name on /subscribe; the
 * strings match by design. Host-created events get none of these.
 */
export const DEFAULT_ADMIN_REFERRAL_CODES = [
	{ code: "JETZY-ME", freeMembershipMonths: 2 },
	{ code: "1M-OFF", freeMembershipMonths: 1 },
] as const

export const isAdminRole = (role: unknown): boolean => role === "admin" || role === "super admin"

/**
 * Best-effort and idempotent: an upsert with `$setOnInsert`, so a retry never duplicates or
 * resets a code, and any failure is logged rather than thrown — a missing code must never fail
 * the event it was meant to decorate.
 */
export async function seedDefaultReferralCodes(eventId: Types.ObjectId | string, createdBy?: Types.ObjectId | string) {
	const { ReferralCodes } = await import("@/models/events/referral-codes")
	const eventObjectId = new Types.ObjectId(String(eventId))

	for (const { code, freeMembershipMonths } of DEFAULT_ADMIN_REFERRAL_CODES) {
		try {
			await ReferralCodes.updateOne(
				{ eventId: eventObjectId, code },
				{
					$setOnInsert: {
						eventId: eventObjectId,
						code,
						discountPercentage: 0,
						freeMembershipMonths,
						maxUses: null,
						isActive: true,
						isDeleted: false,
						usageCount: 0,
						commissionPercentage: 10,
						...(createdBy && Types.ObjectId.isValid(String(createdBy)) ? { createdBy: new Types.ObjectId(String(createdBy)) } : {}),
					},
				},
				{ upsert: true },
			)
		} catch (error: any) {
			if (error?.code === 11000) {
				// The old GLOBAL `code_1` index is still in place here — the string is held by another
				// event. Codes are unique per event only once the migration has run.
				console.error(
					`[default-referral-codes] ${code} already exists on another event — has scripts/migrate-referral-code-index.ts run on this database?`,
					{ eventId: String(eventId) },
				)
			} else {
				console.error(`[default-referral-codes] Failed to create ${code}:`, error?.message || error, { eventId: String(eventId) })
			}
		}
	}
}
