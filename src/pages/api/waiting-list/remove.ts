import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { ensureDbConnected } from "@/configs/database"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	if (req.method !== "DELETE") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const { waitingListId } = req.body

		if (!waitingListId) {
			return sendResponse(res, null, "Waiting list ID is required", false, ResCode.BAD_REQUEST)
		}

		const session = await getServerSession(req, res, authOptions)
		const userRole = (session?.user as any)?.role
		const userId = (session?.user as any)?._id?.toString()
		if (!userId) return sendResponse(res, null, "Not authenticated", false, ResCode.UNAUTHORIZED)
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const entry = await WaitingList.findById(waitingListId)
		if (!entry) {
			return sendResponse(res, null, "Waiting list entry not found", false, ResCode.NOT_FOUND)
		}

		// Ownership: admin OR owner of the event
		const event = await Events.findById(entry.eventId).select("ownerId").lean()
		if (!event) return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		if (!isAdmin && (event as any).ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Not authorized", false, ResCode.FORBIDDEN)
		}

		await WaitingList.findByIdAndDelete(waitingListId)

		return sendResponse(res, { success: true }, "User removed from waiting list successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error removing waiting list user:", error)
		return sendResponse(res, null, "Failed to remove user", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
