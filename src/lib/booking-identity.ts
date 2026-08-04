import { Types } from "mongoose"

/**
 * "Is this booking mine?" — one answer, used everywhere.
 *
 * A booking links to a person two ways and neither is reliable on its own:
 *   - `bookerUserId` is only stamped when the buyer was logged in. Every booking created
 *     before checkout carried a user id through Stripe metadata has none.
 *   - `customerEmail` is whatever was typed into the checkout form, stored verbatim — the
 *     schema has no `lowercase: true`, so a booking made as `Fahad@Example.com` will never
 *     be found by an exact-match query against a lowercased session email.
 *
 * Match on both, and compare the email case-insensitively. Three call sites previously used
 * three different comparison semantics; this is the only one that is correct.
 */

type SessionLike = { user?: { _id?: any; id?: any; email?: string | null } | null } | null | undefined

type BookingLike = { bookerUserId?: any; customerEmail?: string | null } | null | undefined

/** Escape a user-supplied string for safe use inside a RegExp literal. */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const sessionUserId = (session: SessionLike): string | undefined => {
	const raw = (session?.user as any)?._id || (session?.user as any)?.id
	return raw ? String(raw) : undefined
}

export const sessionIsAdmin = (session: SessionLike): boolean => {
	const role = (session?.user as any)?.role
	return role === "admin" || role === "super admin"
}

/**
 * Mongo `$or` clauses that match every booking belonging to the session holder.
 * Returns an empty array when the session carries no usable identity — callers must
 * treat that as "match nothing", never as "match everything".
 */
export const buildBookerMatchClauses = (session: SessionLike): any[] => {
	const clauses: any[] = []

	const userId = sessionUserId(session)
	if (userId && Types.ObjectId.isValid(userId)) {
		clauses.push({ bookerUserId: new Types.ObjectId(userId) })
	}

	const email = session?.user?.email
	if (email) {
		clauses.push({ customerEmail: { $regex: `^${escapeRegex(email.trim())}$`, $options: "i" } })
	}

	return clauses
}

/** In-memory equivalent of the query above, for when the booking is already loaded. */
export const sessionOwnsBooking = (session: SessionLike, booking: BookingLike): boolean => {
	if (!session || !booking) return false

	const userId = sessionUserId(session)
	if (userId && booking.bookerUserId && String(booking.bookerUserId) === userId) return true

	const email = session.user?.email
	if (email && booking.customerEmail && booking.customerEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
		return true
	}

	return false
}
