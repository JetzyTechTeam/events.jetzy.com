import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Types } from "mongoose"
import zod from "zod"
import { zodIssuesToMessage } from "@/lib/zod-error"
import { MarketingLinks } from "@/models/events/marketing-links"
import { ReferralCodes } from "@/models/events/referral-codes"
import { normalizeMarketingTag, validateMarketingTag } from "@/lib/marketing-link"
import { loadManagedEventForMarketing, referralCodeBelongsToEvent, serializeMarketingLink } from "@/lib/marketing-link-server"

/**
 * GET  — the event's marketing links (not deleted), each with its full url and code string.
 * POST — create one. Admin OR event owner.
 */

const createSchema = zod.object({
	label: zod.string().trim().min(1, 'Give the link a name, e.g. "Instagram bio".').max(80, "The name can be at most 80 characters."),
	tag: zod.string().max(80),
	platform: zod.string().trim().max(40).optional(),
	referralCodeId: zod.string().nullable().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET" && req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}
	try {
		const access = await loadManagedEventForMarketing(req, res)
		if (!access) return
		const { event, userId } = access
		const slug = event.slug || String(event._id)

		if (req.method === "GET") {
			const links = await MarketingLinks.find({ eventId: event._id, isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean()
			const codeIds = links.map((l) => l.referralCodeId).filter(Boolean)
			const codes = codeIds.length ? await ReferralCodes.find({ _id: { $in: codeIds } }).select("code").lean() : []
			const codeById = new Map<string, string>(codes.map((c: any) => [String(c._id), String(c.code)]))
			return sendResponse(res, links.map((l) => serializeMarketingLink(l, slug, codeById)), "Marketing links retrieved", true, ResCode.OK)
		}

		const parsed = createSchema.safeParse(req.body)
		if (!parsed.success) {
			return sendResponse(res, parsed.error.errors, zodIssuesToMessage(parsed.error.errors), false, ResCode.BAD_REQUEST)
		}
		const { label, platform, referralCodeId } = parsed.data
		const tag = normalizeMarketingTag(parsed.data.tag)
		const tagProblem = validateMarketingTag(tag)
		if (tagProblem) return sendResponse(res, null, tagProblem, false, ResCode.BAD_REQUEST)

		let codeString: string | null = null
		if (referralCodeId) {
			codeString = await referralCodeBelongsToEvent(event._id, referralCodeId)
			if (!codeString) return sendResponse(res, null, "That referral code isn't on this event.", false, ResCode.BAD_REQUEST)
		}

		// Deleted rows still hold their tag (the index has no partial filter) — revive instead
		// of inserting, like referral codes. A live one is a real duplicate.
		const existing = await MarketingLinks.findOne({ eventId: event._id, tag })
		if (existing && existing.isDeleted !== true) {
			return sendResponse(res, null, `This event already has a link tagged "${tag}". Pick another tag.`, false, ResCode.CONFLICT)
		}

		const fields = {
			label,
			platform: platform || undefined,
			isActive: true,
			isDeleted: false,
			...(userId && Types.ObjectId.isValid(userId) ? { createdBy: new Types.ObjectId(userId) } : {}),
		}
		const codeObjectId = codeString && referralCodeId ? new Types.ObjectId(referralCodeId) : undefined
		let link
		if (existing) {
			existing.set(fields)
			existing.set("referralCodeId", codeObjectId)
			link = await existing.save()
		} else {
			link = await MarketingLinks.create({ eventId: event._id, tag, ...fields, ...(codeObjectId ? { referralCodeId: codeObjectId } : {}) })
		}

		const codeById = new Map<string, string>(codeString && referralCodeId ? [[referralCodeId, codeString]] : [])
		return sendResponse(res, serializeMarketingLink(link.toObject(), slug, codeById), "Marketing link created", true, ResCode.OK)
	} catch (error: any) {
		console.error("[marketing-links/index] Error:", error)
		if (error?.code === 11000) {
			return sendResponse(res, null, "That tag is already in use on this event. Pick another.", false, ResCode.CONFLICT)
		}
		return sendResponse(res, null, "Something went wrong. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
