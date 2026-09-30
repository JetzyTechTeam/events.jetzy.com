import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { Blasts } from "@/models/events/blast"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import zod from "zod"

const updateBlastSchema = zod.object({
	subject: zod.string().optional(),
	message: zod.string().min(1).optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	await ensureDbConnected()
	try {
		const session = await getServerSession(req, res, authOptions)
		if (!session) {
			return sendResponse(res, null, "You need to be logged in to manage blasts.", false, ResCode.UNAUTHORIZED)
		}

		const userRole = (session.user as any)?.role
		const userId = (session.user as any)?._id?.toString()
		const isAdmin = userRole === "admin" || userRole === "super admin"

		const { eventId, blastId } = req.query
		if (!eventId || typeof eventId !== "string") {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!blastId || typeof blastId !== "string") {
			return sendResponse(res, null, "Blast ID is required", false, ResCode.BAD_REQUEST)
		}

		const event = await Events.findOne({ _id: new Types.ObjectId(eventId), isDeleted: false })
		if (!event) {
			return sendResponse(res, null, "Event not found", false, ResCode.NOT_FOUND)
		}

		// Allow admin or event owner only
		if (!isAdmin && event.ownerId?.toString() !== userId) {
			return sendResponse(res, null, "Access denied. You can only manage blasts for your own events.", false, ResCode.FORBIDDEN)
		}

		const blast = await Blasts.findOne({
			_id: new Types.ObjectId(blastId),
			eventId: new Types.ObjectId(eventId),
			isDeleted: false,
		})
		if (!blast) {
			return sendResponse(res, null, "Blast not found", false, ResCode.NOT_FOUND)
		}

		// An admin-sent blast is invisible to the (non-admin) owner — same rule as the list
		// endpoint. 404, not 403: a non-admin owner shouldn't learn one exists by the refusal.
		if (!isAdmin && blast.sentByAdmin) {
			return sendResponse(res, null, "Blast not found", false, ResCode.NOT_FOUND)
		}

		// The full record INCLUDING per-recipient delivery outcomes. Its own method rather than
		// widening the list above, because the recipient array is large and only wanted when a
		// host actually opens a blast to ask who didn't get it.
		if (req.method === "GET") {
			return sendResponse(res, blast, "Blast retrieved successfully", true, ResCode.OK)
		}

		if (req.method === "PATCH") {
			const validation = updateBlastSchema.safeParse(req.body)
			if (!validation.success) {
				return sendResponse(res, validation.error.errors, "Invalid blast data", false, ResCode.BAD_REQUEST)
			}

			const updateData: any = {}
			if (validation.data.subject !== undefined) updateData.subject = validation.data.subject
			if (validation.data.message !== undefined) updateData.message = validation.data.message

			const updated = await Blasts.findByIdAndUpdate(blastId, { $set: updateData }, { new: true })
			return sendResponse(res, updated, "Blast updated successfully", true, ResCode.OK)
		}

		if (req.method === "DELETE") {
			await Blasts.findByIdAndUpdate(blastId, { $set: { isDeleted: true } })
			return sendResponse(res, null, "Blast deleted successfully", true, ResCode.OK)
		}

		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	} catch (error: any) {
		console.error("[blasts/[blastId]] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
