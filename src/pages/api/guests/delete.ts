import type { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { EventInvitation } from "@/models/events/event-invitations"
import { Events } from "@/models/events"
import zod from "zod"

const schema = zod.object({
	guestId: zod.string().nonempty(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed.", false, ResCode.METHOD_NOT_ALLOWED)
	}

	await ensureDbConnected()
	const session = await getServerSession(req, res, authOptions)
	const userRole = (session?.user as any)?.role
	const userId = (session?.user as any)?._id?.toString()
	if (!userId) return sendResponse(res, null, "Not authenticated.", false, ResCode.UNAUTHORIZED)

	const isAdmin = userRole === "admin" || userRole === "super admin"

	const parsed = schema.safeParse(req.body)
	if (!parsed.success) return sendResponse(res, null, "Invalid input.", false, ResCode.BAD_REQUEST)

	const { guestId } = parsed.data
	const invitation = await EventInvitation.findById(guestId).lean()
	if (!invitation) return sendResponse(res, null, "Guest not found.", false, ResCode.NOT_FOUND)

	if (!isAdmin) {
		const event = await Events.findById((invitation as any).eventId, { ownerId: 1 }).lean()
		if (!event || (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Not authorized.", false, ResCode.FORBIDDEN)
		}
	}

	await EventInvitation.deleteOne({ _id: guestId })
	return sendResponse(res, null, "Guest removed.", true, ResCode.OK)
}
