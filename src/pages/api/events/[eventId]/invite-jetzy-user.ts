import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"

const JETZY_API = (process.env.NEXT_PUBLIC_JETZY_API_URL || "https://test.jetzy.com/api").replace(/\/$/, "")

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()

	const session = await getServerSession(req, res, authOptions)
	if (!session) {
		return sendResponse(res, null, "Unauthorized. Please login.", false, ResCode.UNAUTHORIZED)
	}

	const { eventId } = req.query as { eventId: string }
	const { userId } = req.body

	if (!userId) {
		return sendResponse(res, null, "userId is required", false, ResCode.BAD_REQUEST)
	}

	const userRole = (session.user as any)?.role
	const sessionUserId = (session.user as any)?._id?.toString()
	const isAdmin = userRole === "admin" || userRole === "super admin"
	const accessToken = (session as any).accessToken

	// Ownership check
	if (!isAdmin) {
		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false }, { ownerId: 1 }).lean()
		if (!event || (event as any).ownerId?.toString() !== sessionUserId) {
			return sendResponse(res, null, "Access denied.", false, ResCode.FORBIDDEN)
		}
	}

	let inviteSent = false

	if (accessToken) {
		try {
			const inviteRes = await fetch(`${JETZY_API}/v2/events/${eventId}/members/invite`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json",
					"Authorization": `Bearer ${accessToken}`,
				},
				body: JSON.stringify({ userId, mobile: false }),
			})
			inviteSent = inviteRes.ok
		} catch (err) {
			console.error("[invite-jetzy-user] Invite failed:", err)
		}
	}

	return sendResponse(
		res,
		{ inviteSent },
		inviteSent ? "Invitation sent." : "Invite processed.",
		true,
		ResCode.OK
	)
}
