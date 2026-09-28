/**
 * When Manage Event may still trust a shadow draft.
 *
 * Autosave on a PUBLISHED event writes `event.draftRevision` and leaves the live fields
 * alone (`api/events/[eventId]/draft-revision.ts`). The page then prefers that draft over
 * the live document — so if something else edited the event after the draft was written,
 * seeding from the draft would show the host stale values and republish them on the next
 * Update Event. That happened in September 2026 and is why this rule exists.
 *
 * The rule is a heuristic: "has the live record moved on since the draft?". Our own content
 * endpoints answer it properly by `$unset`ting the draft when they save, but the mobile app
 * and the admin portal write this collection too and know nothing about drafts — for those,
 * `updatedAt` moving is the only signal there is.
 *
 * The cost of using `updatedAt` is that a write which changed no content at all — approving
 * the event, a guest voting on the date poll — also moved it, and silently threw the host's
 * work away. Those endpoints call `carryDraftForward` so the draft is vouched for in the
 * same operation.
 *
 * Pure and isomorphic: Manage Event imports it in the browser, the endpoints on the server.
 * Never re-derive either function inline.
 */

/**
 * Legacy drafts were written before `draft-revision.ts` used `timestamps: false`, so their
 * own write moved `updatedAt` a few milliseconds past `savedAt`. Without the slack every one
 * of those reads as stale.
 */
export const DRAFT_FRESHNESS_SLACK_MS = 5000

export interface EventDraftRevision {
	payload?: any
	savedAt?: string | Date | null
	/**
	 * When a write that changed no content last vouched for this draft. Separate from
	 * `savedAt`, which is when the HOST last edited and is what the banner shows them —
	 * overwriting that would misreport their own work back to them. Absent on every draft
	 * written before this existed, which reads exactly as it did before.
	 */
	carriedAt?: string | Date | null
}

const toMs = (value?: string | Date | null): number => {
	if (!value) return 0
	const ms = new Date(value).getTime()
	return Number.isNaN(ms) ? 0 : ms
}

/** The later of "the host saved it" and "a non-content write vouched for it". */
const draftStampMs = (draft?: EventDraftRevision | null): number =>
	Math.max(toMs(draft?.savedAt), toMs(draft?.carriedAt))

/** May Manage Event seed its form from this draft, or has the live record moved on? */
export function draftIsCurrent(draft?: EventDraftRevision | null, updatedAt?: string | Date | null): boolean {
	const stamp = draftStampMs(draft)
	if (stamp === 0) return false
	return stamp + DRAFT_FRESHNESS_SLACK_MS >= toMs(updatedAt)
}

/**
 * `$set` fragment for an endpoint that is about to write something which is NOT event
 * content. Spread it into that endpoint's own update so the vouch lands in the SAME
 * operation — a second write would race its own `updatedAt`.
 *
 * Judged from the document as it was BEFORE the write, so a draft that was already stale
 * stays stale: this keeps a live draft alive, it never resurrects a retired one.
 */
export function carryDraftForward(event?: { draftRevision?: EventDraftRevision | null; updatedAt?: string | Date | null } | null): Record<string, unknown> {
	if (!event?.draftRevision) return {}
	if (!draftIsCurrent(event.draftRevision, event.updatedAt)) return {}
	return { "draftRevision.carriedAt": new Date() }
}
