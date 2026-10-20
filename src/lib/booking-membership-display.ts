/**
 * How a booking's memberships are DESCRIBED — one answer for every console screen, guest page and
 * email in the bookings module.
 *
 * Three rules made a row mean more than "a membership was sold" (2026-10-19):
 *   - Full Concierge INCLUDES Jetzy Premium, so a Premium row beside a Concierge row (bookings held
 *     before that rule) is not charged — approval releases it;
 *   - a membership can be billed YEARLY;
 *   - a row with `upgradeFrom` moves a MONTHLY member onto yearly billing: the year starts when the
 *     monthly plan's paid period ends, and the monthly plan stops then.
 *
 * Every surface used to re-derive its own sentence, and they had drifted: "Full Concierge
 * Membership membership", an included Premium shown as charged, an upgrade shown as a brand-new
 * membership. Read these helpers; never re-derive the rules inline.
 *
 * Pure and client-safe — no models, no Stripe.
 */

import { MEMBERSHIPS, isMembershipKey, membershipLabelList, type MembershipKey } from "@/lib/memberships"

/** The fields of a booking membership row these helpers read. Any superset works. */
export type DisplayMembershipRow = {
	key: string
	status?: string
	amount?: number
	interval?: string
	trialMonths?: number
	renewalAmount?: number
	subscriptionId?: string
	upgradeFrom?: { subscriptionId?: string; paidThrough?: string } | null
}

export type MembershipRowKind = "upgrade" | "included" | "held" | "trial" | "failed" | "new"

const keyOf = (row: DisplayMembershipRow): MembershipKey | null => (isMembershipKey(row?.key) ? row.key : null)

/** "Jetzy Premium membership" / "Full Concierge Membership" — never "… Membership membership". */
export const membershipRowName = (row: DisplayMembershipRow): string => {
	const key = keyOf(row)
	return key ? MEMBERSHIPS[key].receiptLabel : "Membership"
}

/** "Jetzy Premium" / "Full Concierge Membership" — the product name alone. */
export const membershipRowLabel = (row: DisplayMembershipRow): string => {
	const key = keyOf(row)
	return key ? MEMBERSHIPS[key].label : "Membership"
}

export const periodWord = (interval?: string | null): string => (interval === "year" ? "year" : "month")

export const formatMembershipDate = (value?: string | Date | null): string | null => {
	if (!value) return null
	const date = value instanceof Date ? value : new Date(value)
	if (Number.isNaN(date.getTime())) return null
	return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

/** The other membership row on this booking that includes this one (Concierge → Premium), if any. */
export const includingRow = (row: DisplayMembershipRow, rows: DisplayMembershipRow[]): DisplayMembershipRow | null => {
	const key = keyOf(row)
	if (!key) return null
	return (
		rows.find((other) => {
			const otherKey = keyOf(other)
			return otherKey && otherKey !== key && (MEMBERSHIPS[otherKey].includes || []).includes(key) && other.status !== "failed"
		}) || null
	)
}

/**
 * What this row IS, for the sentence that describes it.
 *
 *   upgrade  — moves a monthly member to yearly (`upgradeFrom`);
 *   included — another membership on this booking includes it, so it is not charged;
 *   held     — approved with nothing charged and nothing created: the guest already had it;
 *   trial    — free months;
 *   failed   — paid for, but the subscription could not be started;
 *   new      — an ordinary first period.
 */
export const membershipRowKind = (row: DisplayMembershipRow, rows: DisplayMembershipRow[]): MembershipRowKind => {
	// Either field marks it: host-facing APIs strip the Stripe ids and keep only `paidThrough`.
	if (row.upgradeFrom && (row.upgradeFrom.subscriptionId || row.upgradeFrom.paidThrough)) return "upgrade"
	if (includingRow(row, rows)) return "included"
	if (row.status === "failed") return "failed"
	if (row.status === "active" && !row.subscriptionId && !(Number(row.amount) > 0) && !(Number(row.trialMonths) > 0)) return "held"
	if (Number(row.trialMonths) > 0) return "trial"
	return "new"
}

/** Rows that are actually being sold — included and already-held rows left out. */
export const soldMembershipRows = <T extends DisplayMembershipRow>(rows: T[]): T[] =>
	rows.filter((row) => {
		const kind = membershipRowKind(row, rows)
		return kind !== "included" && kind !== "held"
	})

/** The names of the memberships actually sold on this booking, as one phrase. */
export const soldMembershipNames = (rows: DisplayMembershipRow[]): string => {
	const keys = soldMembershipRows(rows)
		.map(keyOf)
		.filter((key): key is MembershipKey => !!key)
	return membershipLabelList(Array.from(new Set(keys)))
}

/**
 * One short line describing the row, without its amount. Examples:
 *   "switch from monthly to yearly — the year starts November 18, 2026, when the monthly plan ends"
 *   "first year" / "first month"
 *   "2 months free, then $10.00/month"
 *   "included with Full Concierge Membership — not charged"
 *   "already a member — not charged"
 */
export const membershipRowSummary = (row: DisplayMembershipRow, rows: DisplayMembershipRow[]): string => {
	const kind = membershipRowKind(row, rows)
	switch (kind) {
		case "upgrade": {
			const date = formatMembershipDate(row.upgradeFrom?.paidThrough)
			return date
				? `switch from monthly to yearly — the year starts ${date}, when the monthly plan ends`
				: "switch from monthly to yearly — the year starts when the monthly plan's paid month ends"
		}
		case "included": {
			const by = includingRow(row, rows)
			return `included with ${by ? membershipRowLabel(by) : "another membership"} — not charged`
		}
		case "held":
			return "already a member — not charged"
		case "trial": {
			const months = Number(row.trialMonths)
			const then = Number(row.renewalAmount) > 0 ? `, then $${Number(row.renewalAmount).toFixed(2)}/${periodWord(row.interval)}` : ""
			return `${months} ${months === 1 ? "month" : "months"} free${then}`
		}
		case "failed":
			return `first ${periodWord(row.interval)} — not started`
		default:
			return `first ${periodWord(row.interval)}`
	}
}

/** True when the row puts money on the card (or held it): new, upgrade, failed-after-charge. */
export const membershipRowCharged = (row: DisplayMembershipRow, rows: DisplayMembershipRow[]): boolean => {
	const kind = membershipRowKind(row, rows)
	return kind === "new" || kind === "upgrade" || (kind === "failed" && Number(row.amount) > 0)
}

/**
 * The part of a hold that approval will CERTAINLY release: rows another row on the booking
 * includes. `approve.ts` skips those deterministically, so the approve dialog can subtract them
 * before the host presses the button. (Whether the guest has bought the membership elsewhere in
 * the meantime can only be known at approval.)
 */
export const includedRowsCents = (rows: DisplayMembershipRow[]): number =>
	rows
		.filter((row) => row.status === "pending" && membershipRowKind(row, rows) === "included")
		.reduce((sum, row) => sum + Math.round((Number(row.amount) || 0) * 100), 0)

/** "Includes Jetzy Premium" for a membership that includes others, else null. */
export const membershipIncludesLine = (key: string): string | null => {
	if (!isMembershipKey(key)) return null
	const included = MEMBERSHIPS[key].includes || []
	return included.length > 0 ? `Includes ${membershipLabelList(included)}` : null
}

/** Total of the membership rows that moved money, in major units. */
export const chargedMembershipTotal = (rows: DisplayMembershipRow[]): number =>
	Math.round(
		rows.filter((row) => membershipRowCharged(row, rows)).reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100,
	) / 100

/**
 * What cancelling a booking means for its membership — one sentence, or null when the booking
 * sold none. Cancelling a booking never cancels a membership (nothing in `bookings/cancel.ts`
 * touches a subscription), and the no-refund rule covers the membership's first period too, so a
 * guest losing "$X" must be told that part of it bought something they KEEP.
 *
 *   moneyState "captured" → "$595.00 of this was for Full Concierge Membership, which you keep…"
 *   moneyState "hold"     → "…the membership was not started" / "…your monthly plan continues unchanged"
 */
export const cancellationMembershipNote = (
	rows: DisplayMembershipRow[],
	moneyState: string,
	asManager = false,
): string | null => {
	const sold = soldMembershipRows(rows || [])
	if (sold.length === 0) return null
	const names = soldMembershipNames(rows)
	const upgrade = sold.some((row) => membershipRowKind(row, rows) === "upgrade")
	const who = asManager ? "the guest keeps" : "you keep"
	if (moneyState === "hold") {
		return upgrade
			? `The ${names} switch to yearly billing will not happen — ${asManager ? "the guest's" : "your"} monthly plan continues unchanged.`
			: `The ${names} on this request will not be started.`
	}
	if (moneyState === "captured" || moneyState === "unknown") {
		const paid = chargedMembershipTotal(rows)
		const part = paid > 0 ? `$${paid.toFixed(2)} of this was for ${names}, which ${who}` : `${names} is separate from the ticket and ${who} it`
		return `${part} — cancelling the booking doesn't cancel the membership${
			upgrade ? ", and the switch to yearly billing stands" : ""
		}. ${asManager ? "The guest can manage it" : "Manage it"} from Manage membership.`
	}
	return null
}

/**
 * A booking's memberships in the shape the approval emails take (`ApprovalEmailData.payment.
 * memberships`): only those actually SOLD on it (included / already-held rows left out), with the
 * upgrade date when the row moves a monthly member to yearly. Ids never included.
 */
export const membershipRowsForEmail = (rows: DisplayMembershipRow[]) =>
	soldMembershipRows(rows || []).map((row) => {
		const key = keyOf(row)
		return {
			...(key ? { key } : {}),
			label: membershipRowLabel(row),
			receiptLabel: membershipRowName(row),
			amount: Number(row.amount) || 0,
			interval: row.interval || "month",
			...(Number(row.trialMonths) > 0 ? { trialMonths: Number(row.trialMonths), renewalAmount: Number(row.renewalAmount) || 0 } : {}),
			...(row.upgradeFrom?.paidThrough ? { upgradePaidThrough: String(row.upgradeFrom.paidThrough) } : {}),
		}
	})
