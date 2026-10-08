/**
 * The audience statuses a blast is sent to.
 *
 * PURE AND CLIENT-SAFE — the composer, the API and the history label all go through this, so the
 * set the host ticks, the set the query filters on and the set the history reports cannot drift.
 *
 * ONE SELECTION, THREE SHAPES. The field has to survive all of them:
 *
 *  - `["pending", "approved"]` — what the new checkbox UI sends
 *  - `"pending"` — what every caller sent before multi-select, and what a single tick still stores
 *  - `"pending,approved"` — how a multi-selection is stored
 *
 * The last point is why this exists rather than a schema change. `Blasts.status` is a `String`
 * with `default: "all"`, and that collection is shared with the mobile app and the admin portal.
 * Storing a joined string keeps a single selection byte-identical to what it has always been, so
 * existing records need no migration and nothing downstream sees a type it does not expect.
 */

/** No status filter at all — every booking or invitation, whatever state it is in. */
export const BLAST_STATUS_ALL = "all"

export function parseBlastStatuses(value: string | string[] | undefined | null): string[] {
	if (Array.isArray(value)) {
		const cleaned = value.map((v) => (v || "").trim()).filter(Boolean)
		return cleaned.length > 0 ? cleaned : [BLAST_STATUS_ALL]
	}

	const raw = (value || "").trim()
	if (!raw) return [BLAST_STATUS_ALL]

	const cleaned = raw
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean)

	return cleaned.length > 0 ? cleaned : [BLAST_STATUS_ALL]
}

/**
 * What goes in the database.
 *
 * A single selection serialises to a bare string, which is exactly what this field held before
 * multi-select existed.
 */
export function serializeBlastStatuses(value: string | string[] | undefined | null): string {
	return parseBlastStatuses(value).join(",")
}

/** True when the selection means "don't filter at all". */
export function blastStatusIsAll(value: string | string[] | undefined | null): boolean {
	return parseBlastStatuses(value).includes(BLAST_STATUS_ALL)
}

/**
 * The exclusive-All rule, in one place so the checkbox and any future caller agree.
 *
 * Ticking All clears the specific statuses; ticking a specific status clears All. An empty
 * selection falls back to All rather than nothing — a blast addressed to no one is a 404 the host
 * cannot act on, and "I unticked the last box" is not a request to send to nobody.
 */
export function nextBlastStatusSelection(previous: string[], next: string[]): string[] {
	const wasAll = previous.includes(BLAST_STATUS_ALL)
	const hasAll = next.includes(BLAST_STATUS_ALL)

	// All was just ticked -> it wins alone.
	if (hasAll && !wasAll) return [BLAST_STATUS_ALL]

	// Something specific was ticked while All was on -> All drops away.
	if (hasAll && wasAll && next.length > 1) return next.filter((s) => s !== BLAST_STATUS_ALL)

	if (next.length === 0) return [BLAST_STATUS_ALL]
	return next
}

const LABELS: Record<string, string> = {
	all: "All",
	pending: "Pending",
	approved: "Approved",
	confirmed: "Confirmed",
	accepted: "Accepted",
	rejected: "Rejected",
}

/**
 * For the history row.
 *
 * Unknown values are shown as they are rather than dropped: `status` is written by the mobile app
 * and the admin portal too, and a blast that went to a status this build does not recognise should
 * still say so.
 */
export function describeBlastStatuses(value: string | string[] | undefined | null): string {
	return parseBlastStatuses(value)
		.map((s) => LABELS[s] || s)
		.join(", ")
}
