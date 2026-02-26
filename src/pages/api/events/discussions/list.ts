import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { Users } from "@/models/userModal"
import { ensureDbConnected } from "@/configs/database"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    await ensureDbConnected()

    try {
        const { eventId, sort = "recent", page = "1", limit = "20", search } = req.query

        if (!eventId) {
            return sendResponse(res, null, "Event ID is required.", false, ResCode.BAD_REQUEST)
        }

        const pageNum = parseInt(page as string) || 1
        const limitNum = parseInt(limit as string) || 20
        const skip = (pageNum - 1) * limitNum

        const query: any = { eventId }

        if (search) {
            // Find users matching the search query
            const matchingUsers = await Users.find({
                $or: [
                    { firstName: { $regex: search, $options: "i" } },
                    { lastName: { $regex: search, $options: "i" } },
                ],
            }, "_id").lean()
            const userIds = matchingUsers.map((u: any) => u._id)

            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { content: { $regex: search, $options: "i" } },
                { tags: { $regex: search, $options: "i" } },
                { userId: { $in: userIds } },
            ]
        }

        let sortOptions: any = {}
        switch (sort) {
            case "popular":
                sortOptions = { "reactions.like": -1, lastActivityAt: -1 }
                break
            case "trending":
                sortOptions = { lastActivityAt: -1, commentCount: -1 }
                break
            case "recent":
            default:
                sortOptions = { isPinned: -1, lastActivityAt: -1 }
                break
        }

        const [posts, total] = await Promise.all([
            DiscussionPosts.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(limitNum)
                .populate("userId", "firstName lastName image email")
                .lean(),
            DiscussionPosts.countDocuments(query),
        ])

        return sendResponse(
            res,
            {
                posts,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum),
                },
            },
            "Discussion posts fetched successfully.",
            true,
            ResCode.OK
        )
    } catch (error: any) {
        console.error("Error fetching discussion posts:", error)
        return sendResponse(res, null, error.message || "Failed to fetch posts.", false, ResCode.INTERNAL_SERVER_ERROR)
    }
}
