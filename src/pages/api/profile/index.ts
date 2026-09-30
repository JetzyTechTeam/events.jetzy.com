import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { getToken } from "next-auth/jwt"
import zod from "zod"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { ensureDbConnected } from "@/configs/database"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { EventUsers } from "@/models/eventUsersModal"
import {
	GENDER_OPTIONS,
	hasLocation,
	isDefaultAvatar,
	parseDob,
	profileMissingFields,
	type JetzyProfile,
} from "@/lib/jetzy-profile"
import {
	fetchBackendProfile,
	localProfileFromDoc,
	mirrorProfileLocally,
	pushProfileToBackend,
} from "@/lib/jetzy-profile-server"

/**
 * The profile-completion gate's one endpoint.
 *
 * With a backend token the Jetzy backend is the truth — the same `GET/PUT /v1/accounts` the
 * mobile app uses. Without one (the external authorize failed at login) the local `EventUsers`
 * copy stands in and the save is flagged `profileSyncPending`, pushed at the next login that has
 * a token. The person is never told about tokens.
 *
 * FAILS OPEN: if the profile can't be read at all, it reports complete. A backend outage must
 * never lock every logged-in user out of the portal.
 */

const putSchema = zod.object({
	fullName: zod.string().trim().min(1).max(100),
	dob: zod.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
	gender: zod.enum(GENDER_OPTIONS),
	image: zod.string().url(),
	location: zod.object({
		city: zod.string().max(200).optional(),
		region: zod.string().max(200).optional(),
		country: zod.string().max(200).optional(),
		latitude: zod.number().min(-90).max(90).optional(),
		longitude: zod.number().min(-180).max(180).optional(),
	}),
})

const reply = (profile: JetzyProfile, source: "backend" | "local", extra: Record<string, unknown> = {}) => {
	const missing = profileMissingFields(profile)
	return { complete: missing.length === 0, missing, profile, source, ...extra }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)
	const userId = (session?.user as any)?._id?.toString()
	if (!session || !userId) {
		return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
	}

	const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
	const token = ((jwt as any)?.accessToken || (session as any)?.accessToken || null) as string | null

	await ensureDbConnected()

	if (req.method === "GET") {
		const localDoc: any = await EventUsers.findById(userId).lean().catch(() => null)

		if (token) {
			try {
				const backend = await fetchBackendProfile(token)
				// A save made earlier without a token and not yet pushed: fill the gaps from it so the
				// form doesn't ask again for what they already typed.
				if (localDoc?.profileSyncPending) {
					const local = localProfileFromDoc(localDoc)
					const merged: JetzyProfile = {
						image: isDefaultAvatar(backend.image) ? local.image || backend.image : backend.image,
						fullName: backend.fullName || local.fullName,
						dob: backend.dob || local.dob,
						gender: backend.gender || local.gender,
						location: hasLocation(backend.location) ? backend.location : local.location,
					}
					return sendResponse(res, reply(merged, "backend"), "Profile fetched.", true, ResCode.OK)
				}
				return sendResponse(res, reply(backend, "backend"), "Profile fetched.", true, ResCode.OK)
			} catch (err: any) {
				console.warn("[profile] backend GET failed:", err?.message || err)
				return sendResponse(res, { complete: true, missing: [], unavailable: true }, "Profile unavailable.", true, ResCode.OK)
			}
		}

		// No token. Only an EventUsers doc has a local copy we can judge; a `Users` doc (the
		// backend's own collection) we can neither read reliably nor write, so fail open.
		if (!localDoc) {
			return sendResponse(res, { complete: true, missing: [], unavailable: true }, "Profile unavailable.", true, ResCode.OK)
		}
		return sendResponse(res, reply(localProfileFromDoc(localDoc), "local"), "Profile fetched.", true, ResCode.OK)
	}

	if (req.method === "PUT") {
		const parsed = putSchema.safeParse(req.body)
		if (!parsed.success) {
			return sendResponse(res, parsed.error.flatten(), "Please fill in every field.", false, ResCode.BAD_REQUEST)
		}
		const input = parsed.data
		const dob = parseDob(input.dob)
		if (!dob || dob > new Date()) {
			return sendResponse(res, null, "Please enter a valid date of birth.", false, ResCode.BAD_REQUEST)
		}
		if (isDefaultAvatar(input.image)) {
			return sendResponse(res, null, "Please add a profile photo.", false, ResCode.BAD_REQUEST)
		}
		if (!hasLocation(input.location)) {
			return sendResponse(res, null, "Please choose your location from the list.", false, ResCode.BAD_REQUEST)
		}

		if (token) {
			try {
				await pushProfileToBackend(token, input)
			} catch (err: any) {
				console.error("[profile] backend PUT failed:", err?.message || err)
				return sendResponse(res, null, "We couldn't save your profile. Please try again.", false, ResCode.INTERNAL_SERVER_ERROR)
			}
			// Mirror is a convenience (navbar image, proximity code); never fail a save that the
			// backend already accepted.
			await mirrorProfileLocally(userId, input, false).catch((err) => console.warn("[profile] local mirror failed:", err?.message))
			try {
				const fresh = await fetchBackendProfile(token)
				return sendResponse(res, reply(fresh, "backend"), "Profile saved.", true, ResCode.OK)
			} catch {
				return sendResponse(res, { complete: true, missing: [], source: "backend" }, "Profile saved.", true, ResCode.OK)
			}
		}

		const saved = await mirrorProfileLocally(userId, input, true).catch(() => false)
		if (!saved) {
			return sendResponse(res, null, "We couldn't save your profile. Please sign in again and retry.", false, ResCode.INTERNAL_SERVER_ERROR)
		}
		const doc = await EventUsers.findById(userId).lean()
		return sendResponse(res, reply(localProfileFromDoc(doc), "local"), "Profile saved.", true, ResCode.OK)
	}

	return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
}
