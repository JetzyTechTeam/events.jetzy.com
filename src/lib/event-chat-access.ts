import crypto from "crypto"
import { Types } from "mongoose"

/**
 * Who may SEND messages in an event's chat (JetzyChat) — SERVER ONLY.
 *
 * Decided 2026-11-25: anyone signed in can READ the chat; only a guest with a CONFIRMED booking
 * (any live booking — `checked_in` counts, pending does not), the event's host, and admins may
 * post. The Feed below the chat is NOT gated (anyone signed in can still post there).
 *
 * The page can't be trusted to say this — an iframe url is editable — so the answer is signed:
 * a standard HS256 JWT with the shared JetzyChat secret (`JETZYCHAT_MEMBERS_SECRET`), passed in
 * the embed url as `chatAccess`. JetzyChat verifies it and must refuse a send without a valid
 * `canPost: true` token for that event + email. No secret → no token → nothing enforced (today's
 * behaviour), so the chat isn't locked before JetzyChat supports it.
 */

export const CHAT_ACCESS_TTL_SECONDS = 60 * 60 * 12

type SessionLike = { user?: { _id?: any; id?: any; email?: string | null; role?: string | null } | null } | null | undefined

/** Admin, the event's owner, or a confirmed (live) booking matched to this session. */
export async function chatPostAllowed(session: SessionLike, eventId: string): Promise<{ canPost: boolean; reason: "admin" | "host" | "booked" | "not_booked" }> {
	const user = session?.user as any
	const role = user?.role
	if (role === "admin" || role === "super admin") return { canPost: true, reason: "admin" }

	const { Events } = await import("@/models/events")
	const event: any = await Events.findById(eventId).select("ownerId").lean()
	const userId = String(user?._id || user?.id || "")
	if (event?.ownerId && userId && String(event.ownerId) === userId) return { canPost: true, reason: "host" }

	const { buildBookerMatchClauses } = await import("@/lib/booking-identity")
	const clauses = buildBookerMatchClauses(session as any)
	if (!clauses.length) return { canPost: false, reason: "not_booked" }
	const { Bookings } = await import("@/models/events/bookings")
	const { liveCheckInBookingsFilter } = await import("@/lib/check-in-bookings")
	const booked = await Bookings.exists({ ...liveCheckInBookingsFilter(eventId), $or: clauses })
	return booked ? { canPost: true, reason: "booked" } : { canPost: false, reason: "not_booked" }
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")

/** HS256 JWT `{ eventId, email, canPost, iat, exp }`, or null when the secret isn't configured. */
export function signChatAccess(claims: { eventId: string; email: string; canPost: boolean }): { token: string; exp: number } | null {
	const secret = String(process.env.JETZYCHAT_MEMBERS_SECRET || "").trim()
	if (!secret || !Types.ObjectId.isValid(claims.eventId)) return null
	const iat = Math.floor(Date.now() / 1000)
	const exp = iat + CHAT_ACCESS_TTL_SECONDS
	const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
	const payload = b64url(JSON.stringify({ eventId: claims.eventId, email: claims.email, canPost: claims.canPost, iat, exp }))
	const signature = b64url(crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest())
	return { token: `${header}.${payload}.${signature}`, exp }
}
