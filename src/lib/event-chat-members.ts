import { Types } from "mongoose"

/**
 * Event chat members — the JetzyChat room embedded on the event page. SERVER ONLY.
 *
 * JetzyChat keeps its OWN member list per event (our `POST /v2/interests/:id/join` does not touch
 * it), so a guest used to join only by opening the chat themselves — the China event showed 10
 * members against hundreds of bookings. JetzyChat built an endpoint for us (2026-11-25):
 *
 *   POST <JETZYCHAT_MEMBERS_URL>            { eventId, eventName, members: [{ email, jetzyUserId?, name?, image?, isAdmin? }] }
 *   POST <JETZYCHAT_MEMBERS_URL>/remove     { eventId, members: [{ email, jetzyUserId? }] }
 *   Authorization: Bearer <JETZYCHAT_MEMBERS_SECRET>
 *
 * Both are idempotent on their side. They match on the MAIN Jetzy user id (`users._id`) first,
 * then on email ignoring case — so we send the email as stored on that account plus its id, and
 * NEVER a portal (`eventusers`) id: when that differs they would create a second account.
 *
 * OFF until both env vars are set (product sign-off: members with the app start getting pushes).
 * Every call here is best-effort and never throws — a chat outage must never fail a booking.
 */

export type ChatMember = { email: string; jetzyUserId?: string; name?: string; image?: string; isAdmin?: boolean }
type CallResult = { ok: boolean; sent: number; failed: number; error?: string; skipped?: boolean }

const CHUNK = 100
/** Bulk calls (the backfill script). */
const TIMEOUT_MS = 8000
/** Per-booking calls run inside a checkout / cancel request — never hold the guest up for long. */
const BOOKING_TIMEOUT_MS = 4000

function chatConfig(): { url: string; secret: string } | null {
	const url = String(process.env.JETZYCHAT_MEMBERS_URL || "").trim().replace(/\/+$/, "")
	const secret = String(process.env.JETZYCHAT_MEMBERS_SECRET || "").trim()
	return url && secret ? { url, secret } : null
}

export const eventChatSyncEnabled = () => !!chatConfig()

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const emailKey = (email: string) => String(email || "").trim().toLowerCase()

/** A chat member for this address — the main Jetzy account's stored email + id when there is one. */
export async function chatMemberForEmail(rawEmail: string, opts: { name?: string; isAdmin?: boolean } = {}): Promise<ChatMember | null> {
	const email = String(rawEmail || "").trim()
	if (!email) return null
	const base: ChatMember = { email, ...(opts.name?.trim() ? { name: opts.name.trim() } : {}), ...(opts.isAdmin ? { isAdmin: true } : {}) }
	try {
		const { Users } = await import("@Jetzy/models/userModal")
		const { isDefaultAvatar } = await import("@/lib/jetzy-profile")
		const user: any = await Users.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } })
			.select("_id email firstName lastName image")
			.lean()
		if (!user) return base
		const accountName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
		return {
			...base,
			email: user.email || email,
			jetzyUserId: String(user._id),
			...(base.name || accountName ? { name: base.name || accountName } : {}),
			...(user.image && !isDefaultAvatar(user.image) ? { image: user.image } : {}),
		}
	} catch (err: any) {
		console.error("[event-chat] Account lookup failed:", err?.message || err)
		return base
	}
}

/** The event's creator, as chat admin. Null when the owner can't be resolved. */
export async function chatHostMember(event: { ownerId?: any } | null | undefined): Promise<ChatMember | null> {
	const { resolveEventOwner } = await import("@/lib/event-owner")
	const owner = await resolveEventOwner(event)
	return owner ? chatMemberForEmail(owner.email, { name: owner.displayName, isAdmin: true }) : null
}

async function post(path: string, body: Record<string, unknown>, timeoutMs = TIMEOUT_MS): Promise<{ ok: boolean; error?: string }> {
	const cfg = chatConfig()
	if (!cfg) return { ok: false, error: "disabled" }
	try {
		const r = await fetch(`${cfg.url}${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.secret}` },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		})
		if (r.ok) return { ok: true }
		const text = await r.text().catch(() => "")
		return { ok: false, error: `HTTP ${r.status} ${text.slice(0, 200)}` }
	} catch (err: any) {
		return { ok: false, error: err?.message || String(err) }
	}
}

const dedupe = (members: (ChatMember | null)[]): ChatMember[] => {
	const byKey = new Map<string, ChatMember>()
	for (const m of members) {
		if (!m?.email) continue
		const key = emailKey(m.email)
		const prev = byKey.get(key)
		// The admin flag wins — the host may also hold a booking.
		byKey.set(key, prev ? { ...m, ...prev, isAdmin: prev.isAdmin || m.isAdmin || undefined } : m)
	}
	return Array.from(byKey.values()).map((m) => (m.isAdmin ? m : (({ isAdmin: _a, ...rest }) => rest)(m)))
}

async function sendChunks(path: string, members: ChatMember[], body: (chunk: ChatMember[]) => Record<string, unknown>, timeoutMs = TIMEOUT_MS): Promise<CallResult> {
	if (!chatConfig()) return { ok: true, sent: 0, failed: 0, skipped: true }
	let sent = 0
	let failed = 0
	let error: string | undefined
	for (let i = 0; i < members.length; i += CHUNK) {
		const chunk = members.slice(i, i + CHUNK)
		const r = await post(path, body(chunk), timeoutMs)
		if (r.ok) sent += chunk.length
		else {
			failed += chunk.length
			error = error || r.error
		}
	}
	if (error) console.error(`[event-chat] ${path || "add"} failed for ${failed} member(s):`, error)
	return { ok: failed === 0, sent, failed, ...(error ? { error } : {}) }
}

export async function addMembersToEventChat(eventId: string, eventName: string, members: (ChatMember | null)[], timeoutMs = TIMEOUT_MS): Promise<CallResult> {
	const list = dedupe(members)
	if (!list.length) return { ok: true, sent: 0, failed: 0 }
	return sendChunks("", list, (chunk) => ({ eventId: String(eventId), eventName, members: chunk }), timeoutMs)
}

export async function removeMembersFromEventChat(eventId: string, members: (ChatMember | null)[], timeoutMs = TIMEOUT_MS): Promise<CallResult> {
	const list = dedupe(members).map(({ email, jetzyUserId }) => ({ email, ...(jetzyUserId ? { jetzyUserId } : {}) }))
	if (!list.length) return { ok: true, sent: 0, failed: 0 }
	return sendChunks("/remove", list, (chunk) => ({ eventId: String(eventId), members: chunk }), timeoutMs)
}

type BookingLike = { _id?: any; eventId: any; customerEmail?: string; customerName?: string }

async function loadEvent(eventId: any): Promise<{ name: string; ownerId?: any } | null> {
	const { Events } = await import("@/models/events")
	const { stripHtml } = await import("@/utils/text")
	const ev: any = await Events.findById(eventId).select("name ownerId").lean()
	return ev ? { name: stripHtml(ev.name || "") || "Jetzy event", ownerId: ev.ownerId } : null
}

/**
 * A booking just became CONFIRMED → its guest joins the event chat, with the host as admin (sent
 * every time: idempotent, and it keeps the host an admin). Never throws.
 */
export async function syncBookingToEventChat(booking: BookingLike | null | undefined): Promise<void> {
	try {
		if (!booking?.customerEmail || !chatConfig()) return
		const event = await loadEvent(booking.eventId)
		if (!event) return
		const [host, guest] = await Promise.all([chatHostMember(event), chatMemberForEmail(booking.customerEmail, { name: booking.customerName })])
		await addMembersToEventChat(String(booking.eventId), event.name, [host, guest], BOOKING_TIMEOUT_MS)
	} catch (err: any) {
		console.error("[event-chat] Sync on booking failed:", err?.message || err)
	}
}

/**
 * A booking was cancelled → its guest leaves the event chat, UNLESS they still hold another live
 * booking on the event, or they are the event's host. Never throws.
 */
export async function removeBookingFromEventChat(booking: BookingLike | null | undefined): Promise<void> {
	try {
		if (!booking?.customerEmail || !chatConfig()) return
		const email = booking.customerEmail.trim()
		const { Bookings } = await import("@/models/events/bookings")
		const { liveCheckInBookingsFilter } = await import("@/lib/check-in-bookings")
		const stillBooked = await Bookings.exists({
			...liveCheckInBookingsFilter(String(booking.eventId)),
			...(booking._id ? { _id: { $ne: booking._id } } : {}),
			customerEmail: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
		})
		if (stillBooked) return
		const event = await loadEvent(booking.eventId)
		const { resolveEventOwner } = await import("@/lib/event-owner")
		const owner = event ? await resolveEventOwner(event) : null
		if (owner && emailKey(owner.email) === emailKey(email)) return
		await removeMembersFromEventChat(String(booking.eventId), [await chatMemberForEmail(email)], BOOKING_TIMEOUT_MS)
	} catch (err: any) {
		console.error("[event-chat] Remove on cancel failed:", err?.message || err)
	}
}

/** Everyone who belongs in an event's chat: the host (admin) + one member per live-booking email. */
export async function collectEventChatMembers(eventId: string): Promise<{ eventName: string; host: ChatMember | null; members: ChatMember[] }> {
	const event = await loadEvent(new Types.ObjectId(eventId))
	if (!event) throw new Error(`Event ${eventId} not found`)
	const { Bookings } = await import("@/models/events/bookings")
	const { liveCheckInBookingsFilter } = await import("@/lib/check-in-bookings")
	const bookings: any[] = await Bookings.find(liveCheckInBookingsFilter(eventId)).select("customerEmail customerName").lean()
	const seen = new Map<string, { email: string; name?: string }>()
	for (const b of bookings) {
		const email = String(b.customerEmail || "").trim()
		if (email && !seen.has(emailKey(email))) seen.set(emailKey(email), { email, name: b.customerName })
	}
	const host = await chatHostMember(event)
	const guests: ChatMember[] = []
	for (const g of Array.from(seen.values())) {
		const m = await chatMemberForEmail(g.email, { name: g.name })
		if (m) guests.push(m)
	}
	return { eventName: event.name, host, members: dedupe([host, ...guests]) }
}
