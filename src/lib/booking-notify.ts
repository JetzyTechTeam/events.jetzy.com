/**
 * SERVER ONLY — who hears about an event's bookings.
 *
 * Direct mirror of `src/lib/event-approval-notify.ts`: dynamic imports so the models and
 * SendGrid never reach a client bundle, and every path swallows its own failure. **A mail
 * failure must never fail a booking, an approval or a capture.**
 *
 * The rule, in one place:
 *
 *  - Event owned by an **admin / super admin** (a Jetzy-run event) → nothing changes. The
 *    approval notice goes to Jetzy's own inbox exactly as it always has, and `sendTicketConfirmation`
 *    already copies `tech@jetzyapp.com` on every sale, so the Jetzy side is covered.
 *  - Event owned by a **non-admin host** → the notice goes to THAT HOST instead, so the person
 *    who actually has to approve or decline is the person who gets told. Jetzy's inbox copy is
 *    dropped for those events.
 *  - No `ownerId`, an owner we can't resolve, or a lookup that throws → **falls back to the
 *    admin inbox**, i.e. today's behaviour. Losing a notification entirely is worse than
 *    sending it to the wrong inbox.
 *
 * The approval link the host receives already works for them: it points at
 * `/console/events/:id/manage?tab=approvals`, which grants admin **or** the event's owner.
 */

type NotifiableEvent = { _id: any; ownerId?: any; name: string; slug?: string }

type TicketRow = { name: string; quantity: number; price?: number }

export type BookingAudience = { mode: "admin" } | { mode: "owner"; email: string; firstName?: string }

/**
 * The owner's address, but only when they are NOT an admin.
 *
 * `findUserRecord` searches BOTH `Users` and `EventUsers` — one person can hold a document in
 * either, and `ownerId` may point at either one. Never `Users.findById` alone.
 */
export async function resolveBookingAudience(event: NotifiableEvent): Promise<BookingAudience> {
	try {
		if (!event?.ownerId) return { mode: "admin" }
		const { findUserRecord } = await import("@/lib/premium")
		const { isAdminRole } = await import("@/lib/default-referral-codes")
		const record = await findUserRecord(String(event.ownerId))
		const doc = record?.doc
		if (!doc?.email || isAdminRole(doc.role)) return { mode: "admin" }
		return { mode: "owner", email: doc.email, firstName: doc.firstName || undefined }
	} catch (error: any) {
		console.error("[booking-notify] Owner lookup failed, falling back to the admin inbox:", error?.message || error)
		return { mode: "admin" }
	}
}

/**
 * Someone has asked to attend and is waiting on a decision.
 *
 * Replaces the bare `sendAdminApprovalNotice({ kind: "request" })` at every call site. Same
 * template either way — only the recipient, the sender name, the `replyTo` and one line of
 * copy differ (see `audience` in `send-grid.ts`).
 */
export async function notifyApprovalRequest(args: {
	event: NotifiableEvent
	eventId: string
	firstName: string
	lastName: string
	email: string
	tickets: TicketRow[]
	amountOnHold?: number
	holdExpiresAt?: Date | string | null
}): Promise<void> {
	try {
		const audience = await resolveBookingAudience(args.event)
		const { sendAdminApprovalNotice } = await import("@/lib/send-grid")
		await sendAdminApprovalNotice({
			event: args.event as any,
			firstName: args.firstName,
			lastName: args.lastName,
			email: args.email,
			tickets: args.tickets,
			eventId: args.eventId,
			kind: "request",
			amountOnHold: args.amountOnHold,
			holdExpiresAt: args.holdExpiresAt,
			...(audience.mode === "owner" ? { audience: "host" as const, to: audience.email } : {}),
		})
	} catch (error: any) {
		console.error("[booking-notify] approval-request email failed:", error?.message || error)
	}
}

/**
 * A request was approved and confirmed.
 *
 * On a host-owned event this sends NOTHING: the non-admin owner is the person who just pressed
 * Approve, and mailing them a copy of their own action is noise. Jetzy's inbox still gets its
 * record on admin-owned events, unchanged.
 */
export async function notifyApprovalApproved(args: {
	event: NotifiableEvent
	eventId: string
	firstName: string
	lastName: string
	email: string
	tickets: TicketRow[]
	amountCharged?: number
}): Promise<void> {
	try {
		const audience = await resolveBookingAudience(args.event)
		if (audience.mode === "owner") return
		const { sendAdminApprovalNotice } = await import("@/lib/send-grid")
		await sendAdminApprovalNotice({
			event: args.event as any,
			firstName: args.firstName,
			lastName: args.lastName,
			email: args.email,
			tickets: args.tickets,
			eventId: args.eventId,
			kind: "approved",
			amountCharged: args.amountCharged,
		})
	} catch (error: any) {
		console.error("[booking-notify] approval-approved email failed:", error?.message || error)
	}
}

/**
 * A ticket was sold and the booking is confirmed — tell the host.
 *
 * New behaviour: nothing has ever told a host about a sale. `sendOrganizerSaleNotification`
 * has existed in `send-grid.ts` with the right shape and **zero call sites**; this wires it.
 *
 * Owner-mode only, deliberately. On an admin-owned event `sendTicketConfirmation` already
 * copies `tech@jetzyapp.com` on every sale, so a second mail to the same inbox would be two
 * notifications for one transaction.
 */
export async function notifyTicketSold(args: {
	event: NotifiableEvent
	firstName: string
	lastName: string
	email: string
	tickets: TicketRow[]
	orderNumber: string
	totalAmount: number
	referralCode?: string
}): Promise<void> {
	try {
		const audience = await resolveBookingAudience(args.event)
		if (audience.mode !== "owner") return
		const { sendOrganizerSaleNotification } = await import("@/lib/send-grid")
		await sendOrganizerSaleNotification({
			event: args.event as any,
			firstName: args.firstName,
			lastName: args.lastName,
			email: args.email,
			tickets: args.tickets,
			orderNumber: args.orderNumber,
			totalAmount: args.totalAmount,
			referralCode: args.referralCode,
			organizerEmail: audience.email,
		})
	} catch (error: any) {
		console.error("[booking-notify] ticket-sold email failed:", error?.message || error)
	}
}
