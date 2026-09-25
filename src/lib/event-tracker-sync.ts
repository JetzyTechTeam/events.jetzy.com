import { BookingStatus } from "@/models/events/types"

/**
 * Keeping `EventTracker.bookedTickets` in step — SERVER ONLY.
 *
 * The tracker is no longer what capacity is judged from (that is
 * `src/lib/ticket-availability.ts`, which counts the bookings themselves). It is a MIRROR,
 * kept accurate because the mobile app and the admin portal read it off this shared
 * collection.
 *
 * `booking.updateEventTracker()` on the model is additive-only — it means "a new booking
 * appeared" and cannot express a delta, so an edit that lowers a quantity would double-count
 * through it. That method is left alone; anything that moves the counter by an arbitrary
 * amount comes through here.
 */

/**
 * Did this booking ever increment the counter?
 *
 * Only a CONFIRMED booking did. A PENDING approval request never incremented it — the
 * increment happens on approval — so releasing its seats would silently take one away from
 * somebody else.
 */
export const bookingConsumedCapacity = (booking: { status?: string } | null | undefined): boolean =>
	booking?.status === BookingStatus.CONFIRMED

/**
 * Move the counter by `delta`, clamped at zero.
 *
 * **Clamped, always.** `api/bookings/delete.ts` used a bare `$inc: { bookedTickets: -n }`,
 * which on an already-drifted counter drives it negative — and a negative counter *inflates*
 * the availability every other reader computes from it. Routing that call site through here
 * is a deliberate behaviour change: it can no longer go below zero.
 *
 * No upsert, matching every other tracker write: an event with no tracker row simply has no
 * mirror, and inventing one here would write to a shared collection for no gain.
 */
export async function adjustBookedTickets(eventId: any, delta: number): Promise<void> {
	if (!delta) return
	try {
		// Server-only helper: connect before querying so a caller that forgot its own guard
		// cannot race a cold start. Idempotent — a no-op once `readyState === 1`.
		const { ensureDbConnected } = await import("@/configs/database")
		await ensureDbConnected()

		const { EventTracker } = await import("@/models/events/event-tracker")
		await EventTracker.findOneAndUpdate({ eventId }, [
			{ $set: { bookedTickets: { $max: [0, { $add: [{ $ifNull: ["$bookedTickets", 0] }, delta] }] } } },
		])
	} catch (error: any) {
		// The mirror is not the source of truth, so a failure here must not fail the booking
		// operation that triggered it.
		console.error("[event-tracker-sync] Could not adjust bookedTickets:", error?.message || error)
	}
}
