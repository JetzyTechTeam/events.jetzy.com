import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { Types } from "mongoose"
import zod from "zod"
import connectMongo from "@Jetzy/lib/connect-db"
import { createOrUpdateUser } from "@/lib/user-utils"
import { setAlbumGuestCookie } from "@/lib/album-auth"
import { generateMagicToken } from "@/lib/magicLink"

const schema = zod.object({
	name: zod.string().min(1).max(120),
	email: zod.string().email(),
})

/**
 * Low-friction album access: a viewer supplies just a name + email.
 *
 * If the email already belongs to a Jetzy account we simply let them in — no password,
 * no signup screen. If it doesn't, we create the account silently, exactly the way ticket
 * checkout does (createOrUpdateUser). Either way they get a signed cookie and can view.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()

		const { eventId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}

		const validation = schema.safeParse(req.body)
		if (!validation.success) {
			return sendResponse(res, validation.error.errors, "Please enter a valid name and email.", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const email = validation.data.email.trim().toLowerCase()
		const fullName = validation.data.name.trim()
		const firstName = fullName.split(" ")[0] || fullName
		const lastName = fullName.split(" ").slice(1).join(" ")

		// Did this email already have an account? Decides "returning" vs "new" for analytics.
		let isNewAccount = false
		try {
			const db = await connectMongo()
			const existing = await db.collection("users").findOne({ email })
			isNewAccount = !existing
		} catch (e) {
			console.error("[albums/guest-access] existing-user lookup failed:", e)
		}

		// Same helper ticket checkout uses — matches by email or creates the account.
		let userId: string | undefined
		try {
			const result = await createOrUpdateUser({
				firstName,
				lastName,
				email,
				phone: "",
				role: "user",
			})
			userId = result?.userId?.toString()
		} catch (e) {
			// Never block album viewing on account creation.
			console.error("[albums/guest-access] createOrUpdateUser failed:", e)
		}

		setAlbumGuestCookie(res, { email, firstName, lastName, userId })

		// Sign the visitor in for real ONLY when we just created the account. An email that
		// already belongs to someone must not hand out a session — anyone with a share link
		// could otherwise type a known address and take over that account. Existing accounts
		// still get album access via the cookie above, just no login.
		const magicToken = isNewAccount ? generateMagicToken({ email, firstName, lastName, _id: userId }) : undefined

		return sendResponse(res, { email, name: fullName, isNewAccount, magicToken }, "Access granted", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/guest-access] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
