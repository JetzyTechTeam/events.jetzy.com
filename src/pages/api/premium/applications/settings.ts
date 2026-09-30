import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { NextApiRequest, NextApiResponse } from "next"
import { PremiumApplicationSettings } from "@/models/premium-application-settings"
import { getApplicationSettings } from "@/lib/premium-application"
import zod from "zod"

const questionSchema = zod.object({
	id: zod.string().min(1),
	title: zod.string().min(1).max(200),
	type: zod.enum(["text", "options", "multiple_choice", "social_profile", "company", "checkbox", "terms", "mobile", "website"]),
	isRequired: zod.boolean().optional(),
	responseLength: zod.enum(["short", "multi-line"]).optional(),
	selectionType: zod.enum(["single", "multiple"]).optional(),
	options: zod.array(zod.string()).optional(),
	platform: zod.string().optional(),
	collectJobTitle: zod.boolean().optional(),
	termsContentType: zod.enum(["text", "link"]).optional(),
	termsContent: zod.string().optional(),
	collectSignature: zod.boolean().optional(),
})

const putSchema = zod.object({
	enabled: zod.boolean(),
	questions: zod.array(questionSchema),
})

// GET is public — the buy-Premium pages need to know whether to show the question step before
// anyone is signed in. PUT is admin-only: this is the gate + question list for every buyer.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()

	if (req.method === "GET") {
		const settings = await getApplicationSettings()
		return sendResponse(res, settings, "OK", true, ResCode.OK)
	}

	if (req.method === "PUT") {
		const session = await getServerSession(req, res, authOptions)
		const userRole = (session?.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		if (!session) return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		if (!isAdmin) return sendResponse(res, null, "Forbidden", false, ResCode.FORBIDDEN)

		const parsed = putSchema.safeParse(req.body)
		if (!parsed.success) return sendResponse(res, null, "Invalid settings.", false, ResCode.BAD_REQUEST)

		const { enabled, questions } = parsed.data
		await PremiumApplicationSettings.findOneAndUpdate(
			{ key: "default" },
			{ $set: { enabled, questions } },
			{ upsert: true, setDefaultsOnInsert: true },
		)
		return sendResponse(res, { enabled, questions }, "Saved.", true, ResCode.OK)
	}

	return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
}
