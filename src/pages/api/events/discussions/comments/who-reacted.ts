import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { EventUsers } from "@/models/eventUsersModal"
import { Users } from "@/models/userModal"
import { ensureDbConnected } from "@/configs/database"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()

    try {
        const { commentId } = req.query

        if (!commentId) {
            return sendResponse(res, null, "Comment ID is required.", false, ResCode.BAD_REQUEST)
        }

        const comment = await DiscussionComments.findById(commentId).lean()

        if (!comment) {
            return sendResponse(res, null, "Comment not found.", false, ResCode.NOT_FOUND)
        }

        // Handle both 'likes' and 'like' field names for backward compatibility
        const likeIds = comment.reactions?.likes || (comment.reactions as any)?.like || []

        // Users may exist in either EventUsers (event-users) or Users (users) collection
        const [fromEventUsers, fromUsers] = await Promise.all([
            EventUsers.find({ _id: { $in: likeIds } }).select("firstName lastName image email").lean(),
            Users.find({ _id: { $in: likeIds } }).select("firstName lastName image email").lean(),
        ])

        // Merge and deduplicate by _id
        const seen = new Set<string>()
        const users = [...fromEventUsers, ...fromUsers].filter(u => {
            const id = (u as any)._id.toString()
            if (seen.has(id)) return false
            seen.add(id)
            return true
        })

        return sendResponse(res, users, "Users fetched successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error fetching comment reactions:", error)
        return sendResponse(res, null, error.message || "Failed to fetch reactions.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
