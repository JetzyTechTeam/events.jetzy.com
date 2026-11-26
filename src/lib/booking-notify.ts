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
 *
 * **BIDS are the one exception (CEO, 2026-11-27): the admin inbox is told about EVERY bid**,
 * on every event — a host-owned event's bid goes to the host as above AND to the admin inbox.
 * A guest bidding again on the same ticket while an earlier bid is still pending is reported
 * as a raised (or new) bid naming the previous amount (`resolveBidNotice`).
 */

type NotifiableEvent = { _id: any; ownerId?: any; name: string; slug?: string }

type TicketRow = { name: string; quantity: number; price?: number }

export type BookingAudience = { mode: "admin" } | { mode: "owner"; email: string; firstName?: string }

/** A bid, as the approval notice describes it. `previous` = the guest's earlier pending bid. */
export type BidNotice = { amount: number; suggested?: number; normalPrice?: number; previous?: number | null }

/**
 * The bid details for a bid booking — the ticket's suggested and normal price, and the same
 * guest's most recent OTHER bid on that ticket that is still pending (a guest "raises" a bid by
 * placing another; each bid is its own request and hold). Null when the booking is not a bid.
 * Never throws.
 */
export async function resolveBidNotice(booking: any, event: any): Promise<BidNotice | null> {
	const amount = Number(booking?.bidAmount)
	if (booking?.bidAmount === undefined || booking?.bidAmount === null || !Number.isFinite(amount)) return null
	const ticketId = booking?.tickets?.[0]?.ticketId?.toString?.()
	const stored: any = (event?.tickets || []).find((t: any) => String(t?._id) === String(ticketId))
	const notice: BidNotice = {
		amount,
		...(stored && Number.isFinite(Number(stored.bidSuggested)) ? { suggested: Number(stored.bidSuggested) } : {}),
		...(stored && Number.isFinite(Number(stored.price)) ? { normalPrice: Number(stored.price) } : {}),
	}
	try {
		const email = String(booking?.customerEmail || "").trim()
		if (!email || !ticketId) return notice
		const { Bookings } = await import("@/models/events/bookings")
		const { escapeRegex } = await import("@/lib/qrSignups")
		const previous: any = await Bookings.findOne({
			_id: { $ne: booking._id },
			eventId: booking.eventId,
			// `customerEmail` has no `lowercase: true` — case-insensitive, like booking-identity.
			customerEmail: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
			"tickets.ticketId": booking.tickets[0].ticketId,
			bidAmount: { $exists: true, $ne: null },
			status: "pending",
			isDeleted: { $ne: true },
		})
			.sort({ createdAt: -1 })
			.select("bidAmount")
			.lean()
		if (previous && Number.isFinite(Number(previous.bidAmount))) notice.previous = Number(previous.bidAmount)
	} catch (error: any) {
		console.error("[booking-notify] previous-bid lookup failed:", error?.message || error)
	}
	return notice
}

/**
 * The owner's address, but only when they are NOT an admin.
 *
 * The lookup itself lives in `src/lib/event-owner.ts` — one definition, shared with blast
 * sender identity. It searches BOTH `Users` and `EventUsers` (one person can hold a document in
 * either, and `ownerId` may point at either one) and never throws; `null` means "couldn't
 * resolve", which lands on the admin inbox exactly as an admin owner does.
 */
export async function resolveBookingAudience(event: NotifiableEvent): Promise<BookingAudience> {
	const { resolveEventOwner } = await import("@/lib/event-owner")
	const owner = await resolveEventOwner(event)
	if (!owner || owner.isAdmin) return { mode: "admin" }
	return { mode: "owner", email: owner.email, firstName: owner.firstName }
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
	/** What the hold covers beyond the ticket, for the host's breakdown. */
	memberships?: Array<{
		key?: string
		label: string
		receiptLabel: string
		amount: number
		interval: string
		trialMonths?: number
		renewalAmount?: number
		upgradePaidThrough?: string
	}>
	/** Set when the request is a BID — the notice says so, and the admin inbox always gets it. */
	bid?: BidNotice | null
}): Promise<void> {
	try {
		const audience = await resolveBookingAudience(args.event)
		const { sendAdminApprovalNotice } = await import("@/lib/send-grid")
		const notice = {
			event: args.event as any,
			firstName: args.firstName,
			lastName: args.lastName,
			email: args.email,
			tickets: args.tickets,
			eventId: args.eventId,
			kind: "request" as const,
			amountOnHold: args.amountOnHold,
			holdExpiresAt: args.holdExpiresAt,
			...(args.memberships?.length ? { memberships: args.memberships } : {}),
			...(args.bid ? { bid: args.bid } : {}),
		}
		await sendAdminApprovalNotice({
			...notice,
			...(audience.mode === "owner" ? { audience: "host" as const, to: audience.email } : {}),
		})
		// Every bid reaches the admin inbox — on a host-owned event the host got the one above.
		if (args.bid && audience.mode === "owner") await sendAdminApprovalNotice(notice)
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
