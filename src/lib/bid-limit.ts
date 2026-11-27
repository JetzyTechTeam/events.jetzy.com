/**
 * SERVER ONLY — how many bids a person has placed on one ticket (`BID_LIMIT_PER_TICKET`).
 *
 * Counted from BOOKINGS by the checkout email (case-insensitive — `customerEmail` has no
 * `lowercase: true`), and EVERY bid counts whatever became of it: pending, approved, rejected,
 * expired or cancelled. Never throws — a lookup failure logs and returns 0, so a database hiccup
 * never stands between a guest and their bid.
 *
 * Known gap, accepted (same as `PREMIUM_TICKET_LIMIT_PER_EVENT`): a booking is created at
 * fulfilment, so a few checkouts opened minutes apart can all pass the check.
 */
export async function countBidsOnTicket(eventId: string, ticketId: string, email: string): Promise<number> {
	const address = String(email || "").trim()
	if (!eventId || !ticketId || !address) return 0
	try {
		const { ensureDbConnected } = await import("@/configs/database")
		await ensureDbConnected()
		const { Types } = await import("mongoose")
		if (!Types.ObjectId.isValid(eventId) || !Types.ObjectId.isValid(ticketId)) return 0
		const { Bookings } = await import("@/models/events/bookings")
		const { escapeRegex } = await import("@/lib/qrSignups")
		return await Bookings.countDocuments({
			eventId: new Types.ObjectId(eventId),
			"tickets.ticketId": new Types.ObjectId(ticketId),
			customerEmail: { $regex: `^${escapeRegex(address)}$`, $options: "i" },
			bidAmount: { $exists: true, $ne: null },
			isDeleted: { $ne: true },
		})
	} catch (error: any) {
		console.error("[bid-limit] count failed:", error?.message || error)
		return 0
	}
}
