import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import { Users } from "@/models/userModal"
import { EventUsers } from "@/models/eventUsersModal"
import { ensureDbConnected } from "@/configs/database"
import { escapeRegExp } from "@/utils/text"

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

        const query: any = { eventId, isReported: { $ne: true } }

        if (search) {
            const searchRegex = escapeRegExp(search as string)
            // Find users matching the search query
            const matchingUsers = await Users.find({
                $or: [
                    { firstName: { $regex: searchRegex, $options: "i" } },
                    { lastName: { $regex: searchRegex, $options: "i" } },
                ],
            }, "_id").lean()
            const userIds = matchingUsers.map((u: any) => u._id)

            query.$or = [
                { title: { $regex: searchRegex, $options: "i" } },
                { content: { $regex: searchRegex, $options: "i" } },
                { tags: { $regex: searchRegex, $options: "i" } },
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

        const [postsRaw, total] = await Promise.all([
            DiscussionPosts.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            DiscussionPosts.countDocuments(query),
        ])

        // Resolve userIds from both Users and EventUsers collections
        const rawUserIds = [...new Set(postsRaw.map((p: any) => p.userId?.toString()).filter(Boolean))]
        const [mainUsers, eventUsersData] = await Promise.all([
            Users.find({ _id: { $in: rawUserIds } }).select('firstName lastName image email').lean(),
            EventUsers.find({ _id: { $in: rawUserIds } }).select('firstName lastName image email').lean(),
        ])
        const userMap: Record<string, any> = {}
        ;[...mainUsers, ...eventUsersData].forEach((u: any) => { userMap[u._id.toString()] = u })
        const posts = postsRaw.map((post: any) => ({
            ...post,
            lastActivityAt: post.lastActivityAt || post.createdAt,
            userId: post.userId ? (userMap[post.userId.toString()] || null) : null,
        }))

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
