/**
 * Shared query helpers for QR signup analytics
 * (`/api/analytics/qr-signups/*` and the console page that reads them).
 */

export const QR_SIGNUP_SOURCE = "jetzyqrsignup"
export const QR_SIGNUP_PAGE = "/jetzyqrsignup"

/**
 * Rows created before `signupSource` existed carry no marker. Location/placeId
 * are collected ONLY on /jetzyqrsignup (the /signup form has no location
 * field), so their presence is a reliable proxy for a legacy QR signup.
 * Nothing is written back — the inference lives in the query layer only.
 */
export const qrSourceMatch = {
	$or: [
		{ signupSource: QR_SIGNUP_SOURCE },
		{
			signupSource: { $exists: false },
			$or: [{ location: { $exists: true, $ne: "" } }, { placeId: { $exists: true, $ne: "" } }],
		},
	],
}

/** Inclusive day-boundary date range, matching the journey analytics APIs. */
export const buildDateFilter = (dateFrom?: string, dateTo?: string) => {
	if (!dateFrom && !dateTo) return null
	const filter: any = {}
	if (dateFrom) {
		const d = new Date(dateFrom)
		d.setHours(0, 0, 0, 0)
		filter.$gte = d
	}
	if (dateTo) {
		const d = new Date(dateTo)
		d.setHours(23, 59, 59, 999)
		filter.$lte = d
	}
	return filter
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const escapeCsv = (val: any) => {
	if (val === null || val === undefined) return ""
	const s = String(val)
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
