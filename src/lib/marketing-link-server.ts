import { Types } from "mongoose"
import { marketingLinkUrl, normalizeMarketingTag } from "@/lib/marketing-link"

/** What the console receives for one link — full url included, no ObjectIds. */
export function serializeMarketingLink(link: any, slug: string, codeById: Map<string, string>) {
	const baseUrl = process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com"
	const referralCodeId = link.referralCodeId ? String(link.referralCodeId) : null
	return {
		_id: String(link._id),
		tag: link.tag as string,
		label: link.label as string,
		platform: (link.platform as string) || null,
		isActive: link.isActive !== false,
		referralCodeId,
		referralCode: referralCodeId ? codeById.get(referralCodeId) || null : null,
		url: marketingLinkUrl(baseUrl, slug, link.tag),
		createdAt: link.createdAt,
	}
}

/**
 * Server-only marketing-link lookups. Pure helpers are in `marketing-link.ts`.
 *
 * Every function here NEVER THROWS: attribution is instrumentation, and a lookup failure must
 * never stand between a visitor and the event page, or a buyer and their ticket.
 */

export type LandingMarketingLink = {
	linkId: string
	tag: string
	/** Present only while the attached code would still be accepted at checkout. */
	referralCode?: string
}

async function loadModels() {
	const { ensureDbConnected } = await import("@/configs/database")
	await ensureDbConnected()
	const { MarketingLinks } = await import("@/models/events/marketing-links")
	return { MarketingLinks }
}

/**
 * The link a visitor arrived on (`?mk=`). Active + not deleted only — a link the host switched
 * off stops collecting NEW visitors. Its referral code is passed through only if it is still
 * valid, so the checkout modal is never pre-filled with a code it would then refuse.
 */
export async function resolveMarketingLinkByTag(eventId: string, rawTag: unknown): Promise<LandingMarketingLink | null> {
	try {
		const tag = normalizeMarketingTag(Array.isArray(rawTag) ? rawTag[0] : rawTag)
		if (!tag || !Types.ObjectId.isValid(eventId)) return null
		const { MarketingLinks } = await loadModels()
		const link = await MarketingLinks.findOne({
			eventId: new Types.ObjectId(eventId),
			tag,
			isDeleted: { $ne: true },
			isActive: { $ne: false },
		}).lean()
		if (!link) return null

		let referralCode: string | undefined
		if (link.referralCodeId) {
			const { ReferralCodes } = await import("@/models/events/referral-codes")
			const code = await ReferralCodes.findOne({ _id: link.referralCodeId, eventId: link.eventId }).select("code").lean()
			if (code?.code) {
				const { validateReferralCodeForEvent } = await import("@/lib/referral-validation")
				const verdict = await validateReferralCodeForEvent(eventId, code.code)
				if (verdict.ok && verdict.data) referralCode = verdict.data.code
			}
		}

		return { linkId: String(link._id), tag: link.tag, ...(referralCode ? { referralCode } : {}) }
	} catch (err) {
		console.error("[marketing-link] resolve by tag failed:", err)
		return null
	}
}

/**
 * The link to credit a visit or booking to — only a link of THIS event that is ON right now.
 *
 * OFF STOPS ALL NEW COUNTING, even for a browser that opened the link while it was on and still
 * remembers it (decided 2026-11-24 — a host switching a link off expects its numbers to freeze).
 * Checked here on the server because the browser's 30-day memory can't know the link was
 * switched off. A link id from another event (a stale or forged body) credits nothing.
 *
 * `requireActive: false` is for checkout FULFILMENT only: the on/off decision was already made
 * when the checkout session was opened, and a host switching the link off during the seconds
 * the buyer spends on Stripe must not un-credit a sale that started while it was on.
 */
export async function resolveMarketingLinkForBooking(
	eventId: string | undefined | null,
	rawLinkId: unknown,
	{ requireActive = true }: { requireActive?: boolean } = {},
): Promise<{ id: string; tag: string } | null> {
	try {
		const linkId = typeof rawLinkId === "string" ? rawLinkId.trim() : ""
		if (!linkId || !eventId || !Types.ObjectId.isValid(linkId) || !Types.ObjectId.isValid(String(eventId))) return null
		const { MarketingLinks } = await loadModels()
		const link = await MarketingLinks.findOne({
			_id: new Types.ObjectId(linkId),
			eventId: new Types.ObjectId(String(eventId)),
			isDeleted: { $ne: true },
			...(requireActive ? { isActive: { $ne: false } } : {}),
		})
			.select("tag")
			.lean()
		return link ? { id: String(link._id), tag: link.tag } : null
	} catch (err) {
		console.error("[marketing-link] resolve for booking failed:", err)
		return null
	}
}

/**
 * Admin OR event owner — the canonical block, shared by the three marketing-link routes.
 * Writes the refusal itself and returns null; on success returns the event (slug + owner).
 */
export async function loadManagedEventForMarketing(
	req: import("next").NextApiRequest,
	res: import("next").NextApiResponse,
): Promise<{ event: { _id: Types.ObjectId; slug?: string; ownerId?: Types.ObjectId }; userId?: string; isAdmin: boolean } | null> {
	const { sendResponse } = await import("@Jetzy/lib/helpers")
	const { ResCode } = await import("@Jetzy/lib/responseCodes")
	const { ensureDbConnected } = await import("@/configs/database")
	await ensureDbConnected()
	const { getServerSession } = await import("next-auth")
	const { authOptions } = await import("@/pages/api/auth/[...nextauth]")
	const session = await getServerSession(req, res, authOptions)
	if (!session) {
		sendResponse(res, null, "You need to be logged in to manage marketing links.", false, ResCode.UNAUTHORIZED)
		return null
	}
	const role = (session.user as any)?.role
	const userId = (session.user as any)?._id?.toString()
	const isAdmin = role === "admin" || role === "super admin"

	const eventId = typeof req.query.eventId === "string" ? req.query.eventId : ""
	if (!Types.ObjectId.isValid(eventId)) {
		sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		return null
	}
	const { Events } = await import("@/models/events")
	const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("slug ownerId").lean()
	if (!event) {
		sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		return null
	}
	if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
		sendResponse(res, null, "Access denied. Only the event owner can manage marketing links.", false, ResCode.FORBIDDEN)
		return null
	}
	return { event: event as any, userId, isAdmin }
}

/** A referral code id is acceptable on a link only if it is a live code of THIS event. */
export async function referralCodeBelongsToEvent(eventId: Types.ObjectId, codeId: string): Promise<string | null> {
	if (!Types.ObjectId.isValid(codeId)) return null
	const { ReferralCodes } = await import("@/models/events/referral-codes")
	const code = await ReferralCodes.findOne({ _id: new Types.ObjectId(codeId), eventId, isDeleted: { $ne: true } }).select("code").lean()
	return code?.code || null
}

/**
 * Adds `marketingLinkLabel` / `marketingLinkPlatform` to plain booking rows that came through
 * one of this event's marketing links, so Bookings, Guests and the event page can say
 * "via Instagram bio" instead of a raw tag. Deleted links included — an old booking still
 * deserves its name. One query per call. Never throws; on failure the rows come back as given
 * and the chip falls back to the stored tag.
 */
export async function attachMarketingLinkLabels<T extends Record<string, any>>(eventId: unknown, rows: T[]): Promise<T[]> {
	try {
		if (!rows.some((r) => r?.marketingLinkId)) return rows
		const id = String(eventId || "")
		if (!Types.ObjectId.isValid(id)) return rows
		const { MarketingLinks } = await loadModels()
		const links = await MarketingLinks.find({ eventId: new Types.ObjectId(id) }).select("label platform").lean()
		const byId = new Map(links.map((l) => [String(l._id), l]))
		for (const row of rows) {
			const link = row?.marketingLinkId ? byId.get(String(row.marketingLinkId)) : undefined
			if (link) {
				;(row as any).marketingLinkLabel = link.label
				;(row as any).marketingLinkPlatform = link.platform || null
			}
		}
		return rows
	} catch (err) {
		console.error("[marketing-link] attach labels failed:", err)
		return rows
	}
}
