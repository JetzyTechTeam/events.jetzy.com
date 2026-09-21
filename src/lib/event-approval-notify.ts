/**
 * SERVER ONLY — emails the event owner about the admin moderation gate.
 *
 * Kept out of `event-approval.ts`, which is isomorphic and imported by pages: this reaches the
 * user models and SendGrid. Both functions are best-effort — a mail failure must never fail
 * the save or the approval that triggered it.
 *
 * Only NON-ADMIN owners are emailed. The owner's role is read off their account, not the
 * session, so an admin approving (or editing) a host's event still reaches the host, and an
 * admin's own event never mails the admin.
 */
const isAdminRole = (role: unknown): boolean => role === "admin" || role === "super admin"

type NotifiableEvent = { _id: any; ownerId?: any; name: string; slug?: string }

async function resolveNonAdminOwner(event: NotifiableEvent): Promise<{ email: string; firstName?: string } | null> {
	if (!event?.ownerId) return null
	const { findUserRecord } = await import("@/lib/premium")
	const record = await findUserRecord(String(event.ownerId))
	const doc = record?.doc
	if (!doc?.email || isAdminRole(doc.role)) return null
	return { email: doc.email, firstName: doc.firstName || undefined }
}

export async function notifyOwnerEventSubmitted(event: NotifiableEvent): Promise<void> {
	try {
		const owner = await resolveNonAdminOwner(event)
		if (!owner) return
		const { sendEventSubmittedForReview, sendEventReviewAdminNotice } = await import("@/lib/send-grid")
		// Host + admin support, together: the host is told it's under review, support is told
		// there is something to review. Each send already swallows its own failure.
		await Promise.all([
			sendEventSubmittedForReview({ ...owner, event }),
			sendEventReviewAdminNotice({ event, ownerEmail: owner.email, ownerName: owner.firstName }),
		])
	} catch (error: any) {
		console.error("[event-approval-notify] submitted email failed:", error?.message || error)
	}
}

export async function notifyOwnerEventApproved(event: NotifiableEvent): Promise<void> {
	try {
		const owner = await resolveNonAdminOwner(event)
		if (!owner) return
		const { sendEventApprovedByAdmin } = await import("@/lib/send-grid")
		await sendEventApprovedByAdmin({ ...owner, event })
	} catch (error: any) {
		console.error("[event-approval-notify] approved email failed:", error?.message || error)
	}
}
