import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { AlbumTags } from "@/models/events/album-tags"
import { ensureDbConnected } from "@/configs/database"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Types } from "mongoose"
import { resolveAlbumViewer } from "@/lib/album-auth"

// DELETE a tag. Allowed for whoever created the tag, the tagged person themselves,
// or the event admin/owner.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "DELETE") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		await ensureDbConnected()

		const viewer = await resolveAlbumViewer(req, res)
		if (!viewer) {
			return sendResponse(res, null, "Enter your name and email to view this album.", false, ResCode.UNAUTHORIZED)
		}

		const { eventId, albumId, tagId } = req.query
		if (!eventId || typeof eventId !== "string" || !Types.ObjectId.isValid(eventId)) {
			return sendResponse(res, null, "Valid event ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!albumId || typeof albumId !== "string" || !Types.ObjectId.isValid(albumId)) {
			return sendResponse(res, null, "Valid album ID is required", false, ResCode.BAD_REQUEST)
		}
		if (!tagId || typeof tagId !== "string" || !Types.ObjectId.isValid(tagId)) {
			return sendResponse(res, null, "Valid tag ID is required", false, ResCode.BAD_REQUEST)
		}

		const eventObjectId = new Types.ObjectId(eventId)

		const tag = await AlbumTags.findOne({
			_id: new Types.ObjectId(tagId),
			albumId: new Types.ObjectId(albumId),
			eventId: eventObjectId,
		})
		if (!tag) {
			return sendResponse(res, null, "Tag not found", false, ResCode.NOT_FOUND)
		}

		const session = await getServerSession(req, res, authOptions)
		const userRole = (session?.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"
		const userId = (session?.user as any)?._id?.toString()

		const event = await Events.findOne({ _id: eventObjectId, isDeleted: false }).select("_id ownerId").lean()
		const isOwner = !!userId && (event as any)?.ownerId?.toString() === userId

		const isTagger = tag.taggedByEmail === viewer.email
		const isTagged = tag.personEmail === viewer.email

		if (!isAdmin && !isOwner && !isTagger && !isTagged) {
			return sendResponse(res, null, "You can only remove tags you added, or tags of yourself.", false, ResCode.FORBIDDEN)
		}

		await AlbumTags.deleteOne({ _id: tag._id })

		return sendResponse(res, null, "Tag removed", true, ResCode.OK)
	} catch (error: any) {
		console.error("[albums/tags/[tagId]] Error:", error)
		return sendResponse(res, null, error.message || "An error occurred", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
