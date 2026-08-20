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
import { sendWelcomeEmail } from "@/lib/send-grid"
import { AlbumInterest } from "@/models/events/album-interest"
import { consumeAlbumCode, consumeFailureMessage } from "@/lib/album-verification"

const schema = zod.object({
	name: zod.string().min(1).max(120),
	email: zod.string().email(),
	// Captured for event planning; no upper limit (client requires at least one). The .max(50)
	// caps are just abuse guards.
	interests: zod.array(zod.string().max(60)).max(50).optional(),
	customInterests: zod.array(zod.string().max(200)).max(50).optional(),
	optOut: zod.boolean().optional(),
	// Proof the address is theirs, from /albums/send-code.
	code: zod.string().regex(/^\d{6}$/),
})

/**
 * Low-friction album access: a viewer supplies just a name + email.
 *
 * If the email already belongs to a Jetzy account we simply let them in — no password,
 * no signup screen. If it doesn't, we create the account silently, exactly the way ticket
 * checkout does (createOrUpdateUser). Either way they get a signed cookie and can view.
 *
 * The address must first be proved with the code from /albums/send-code. That check runs
 * before anything is written, so a mistyped or borrowed address never creates an account
 * and never lands in the interests report.
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

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }).select("_id name").lean()
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		const email = validation.data.email.trim().toLowerCase()

		// Prove the address BEFORE creating an account, setting a cookie or recording
		// interests — an unverified attempt must leave nothing behind.
		const check = await consumeAlbumCode(eventId, email, validation.data.code)
		if (!check.ok) {
			return sendResponse(res, null, consumeFailureMessage(check.reason), false, ResCode.BAD_REQUEST)
		}
		const verifiedAt = new Date()

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

		setAlbumGuestCookie(res, { email, firstName, lastName, userId, verifiedAt })

		// Capture the interests for event planning. One row per (event, email), upserted so
		// re-entry updates. Never block album entry if this write fails.
		try {
			const interests = validation.data.interests?.map((i) => i.trim()).filter(Boolean) || []
			const customInterests = validation.data.customInterests?.map((i) => i.trim()).filter(Boolean) || []
			const optOut = validation.data.optOut === true
			// Opting out is an answer too — record it so we don't keep asking.
			if (interests.length > 0 || customInterests.length > 0 || optOut) {
				await AlbumInterest.updateOne(
					{ eventId: new Types.ObjectId(eventId), email },
					{
						$set: {
							name: fullName,
							userId: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
							interests,
							customInterests,
							optOut,
							verified: true,
						},
						// Clear the legacy single field on any fresh write so it can't linger.
						$unset: { customInterest: "" },
					},
					{ upsert: true },
				)
			}
		} catch (e) {
			console.error("[albums/guest-access] interest capture failed:", e)
		}

		// Sign the visitor in for real ONLY when we just created the account. An email that
		// already belongs to someone must not hand out a session — anyone with a share link
		// could otherwise type a known address and take over that account. Existing accounts
		// still get album access via the cookie above, just no login.
		const magicToken = isNewAccount ? generateMagicToken({ email, firstName, lastName, _id: userId }) : undefined

		// Welcome the brand-new account, and tell them where it came from so the safety
		// notice (with its block link) makes sense. Fire-and-forget — never block entry.
		if (isNewAccount) {
			const eventName = (event as any).name ? `while viewing photos from "${(event as any).name}"` : "while viewing an event album"
			sendWelcomeEmail({ email, firstName, lastName, context: eventName }).catch((e) =>
				console.error("[albums/guest-access] welcome email failed:", e),
			)
		}

		return sendResponse(res, { email, name: fullName, isNewAccount, magicToken }, "Access granted", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/guest-access] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
