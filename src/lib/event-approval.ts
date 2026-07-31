/**
 * Admin moderation gate for public events.
 *
 * A public event is created as `adminApprovalStatus: "pending"` and stays invisible to
 * everyone but its owner (and admins) until an admin approves it. Private events are
 * auto-approved on creation, so they are never pending.
 *
 * Not to be confused with the *host*-facing approval features, which are unrelated:
 *   - `ticket-approval.ts`  — a host approving individual guest bookings
 *   - `booking-status.ts`   — the state of a single booking
 *
 * Kept isomorphic so pages, components and API routes all share one definition. Several
 * call sites previously re-derived this inline with two different spellings
 * (`privacy === "public"` vs `privacy !== "private"`); the enum is only
 * `["public","private"]` so they agreed in practice, but they no longer have to.
 */

export type ApprovableEvent = {
	privacy?: string | null
	adminApprovalStatus?: string | null
}

/** True while a public event is still awaiting admin review. */
export const isPendingAdminApproval = (event?: ApprovableEvent | null): boolean =>
	event?.privacy === "public" && event?.adminApprovalStatus === "pending"

/**
 * Shared refusal copy for outward-facing actions (invites, blasts, checkout) so a host
 * sees the same explanation wherever they hit the gate.
 */
export const PENDING_APPROVAL_MESSAGE =
	"This event is awaiting admin approval. You can invite guests and send blasts once it's approved."
