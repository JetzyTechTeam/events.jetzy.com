import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionComments } from "@/models/events/discussion-comments"
import { Users } from "@/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import { ensureDbConnected } from "@/configs/database"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()

    try {
        const { postId } = req.query

        if (!postId) {
            return sendResponse(res, null, "Post ID is required.", false, ResCode.BAD_REQUEST)
        }

        const commentsRaw = await DiscussionComments.find({ discussionPostId: postId, isDeleted: false, isReported: { $ne: true } })
            .sort({ createdAt: 1 })
            .lean()

        // Resolve userIds from both Users and EventUsers collections
        const rawUserIds = [...new Set(commentsRaw.map((c: any) => c.userId?.toString()).filter(Boolean))]
        const [mainUsers, eventUsersData] = await Promise.all([
            Users.find({ _id: { $in: rawUserIds } }).select('firstName lastName image email').lean(),
            EventUsers.find({ _id: { $in: rawUserIds } }).select('firstName lastName image email').lean(),
        ])
        const userMap: Record<string, any> = {}
        ;[...mainUsers, ...eventUsersData].forEach((u: any) => { userMap[u._id.toString()] = u })
        const comments = commentsRaw.map((c: any) => ({
            ...c,
            userId: c.userId ? (userMap[c.userId.toString()] || null) : null,
        }))

        return sendResponse(res, comments, "Comments fetched successfully.", true, ResCode.OK)
    } catch (error: any) {
        console.error("Error fetching discussion comments:", error)
        return sendResponse(res, null, error.message || "Failed to fetch comments.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
