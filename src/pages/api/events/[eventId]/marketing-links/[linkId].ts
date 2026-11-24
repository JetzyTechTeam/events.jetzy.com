import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Types } from "mongoose"
import zod from "zod"
import { zodIssuesToMessage } from "@/lib/zod-error"
import { MarketingLinks } from "@/models/events/marketing-links"
import { loadManagedEventForMarketing, referralCodeBelongsToEvent, serializeMarketingLink } from "@/lib/marketing-link-server"

/**
 * PATCH  — label, platform, referral code (null clears), active. The TAG is never editable:
 *          posts already carry it.
 * DELETE — soft delete; bookings keep resolving the link. Admin OR event owner.
 */

const patchSchema = zod.object({
	label: zod.string().trim().min(1, "The name can't be empty.").max(80, "The name can be at most 80 characters.").optional(),
	platform: zod.string().trim().max(40).nullable().optional(),
	referralCodeId: zod.string().nullable().optional(),
	isActive: zod.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "PATCH" && req.method !== "DELETE") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}
	try {
		const access = await loadManagedEventForMarketing(req, res)
		if (!access) return
		const { event } = access

		const linkId = typeof req.query.linkId === "string" ? req.query.linkId : ""
		if (!Types.ObjectId.isValid(linkId)) return sendResponse(res, null, "Invalid link", false, ResCode.BAD_REQUEST)
		const link = await MarketingLinks.findOne({ _id: new Types.ObjectId(linkId), eventId: event._id, isDeleted: { $ne: true } })
		if (!link) return sendResponse(res, null, "Marketing link not found", false, ResCode.NOT_FOUND)

		if (req.method === "DELETE") {
			link.set({ isDeleted: true, isActive: false })
			await link.save()
			return sendResponse(res, { _id: linkId }, "Marketing link deleted", true, ResCode.OK)
		}

		const parsed = patchSchema.safeParse(req.body)
		if (!parsed.success) {
			return sendResponse(res, parsed.error.errors, zodIssuesToMessage(parsed.error.errors), false, ResCode.BAD_REQUEST)
		}
		const { label, platform, referralCodeId, isActive } = parsed.data
		if (label !== undefined) link.set("label", label)
		if (platform !== undefined) link.set("platform", platform || undefined)
		if (isActive !== undefined) link.set("isActive", isActive)

		// Omitted = unchanged; null / "" = clear.
		if (referralCodeId === null || referralCodeId === "") {
			link.set("referralCodeId", undefined)
		} else if (referralCodeId !== undefined) {
			if (!(await referralCodeBelongsToEvent(event._id, referralCodeId))) {
				return sendResponse(res, null, "That referral code isn't on this event.", false, ResCode.BAD_REQUEST)
			}
			link.set("referralCodeId", new Types.ObjectId(referralCodeId))
		}
		await link.save()

		const codeId = link.referralCodeId ? String(link.referralCodeId) : null
		const codeString = codeId ? await referralCodeBelongsToEvent(event._id, codeId) : null
		const codeById = new Map<string, string>(codeId && codeString ? [[codeId, codeString]] : [])
		return sendResponse(res, serializeMarketingLink(link.toObject(), event.slug || String(event._id), codeById), "Marketing link updated", true, ResCode.OK)
	} catch (error: any) {
		console.error("[marketing-links/[linkId]] Error:", error)
		return sendResponse(res, null, "Something went wrong. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
