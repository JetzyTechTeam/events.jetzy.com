import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { DiscussionPosts } from "@/models/events/discussion-posts"
import "@/models/userModal" // Import Users model to register it with Mongoose
import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.METHOD_NOT_ALLOWED)
	}

	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[discussions/list] Database not connected, attempting to connect...")
			try {
				await Promise.race([dbconn.asPromise(), new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 30000))])
			} catch (connError: any) {
				console.error("[discussions/list] Database connection failed:", connError.message)
				return sendResponse(res, null, "Database connection failed", false, ResCode.INTERNAL_SERVER_ERROR)
			}
		}

		const { eventId, sort = "recent", tags, page = "1", limit = "20", search } = req.query

		if (!eventId) {
			return sendResponse(res, null, "Event ID is required", false, ResCode.BAD_REQUEST)
		}

		console.log(`[discussions/list] Fetching posts for event: ${eventId}`)

		const pageNum = parseInt(page as string)
		const limitNum = parseInt(limit as string)
		const skip = (pageNum - 1) * limitNum

		// Build query
		const query: any = { eventId }

		// Filter by tags
		if (tags) {
			const tagArray = (tags as string).split(",")
			query.tags = { $in: tagArray }
		}

		// Search in title and content
		if (search) {
			query.$or = [{ title: { $regex: search, $options: "i" } }, { content: { $regex: search, $options: "i" } }]
		}

		// Determine sort order
		let sortQuery: any = {}
		switch (sort) {
			case "recent":
				sortQuery = { isPinned: -1, lastActivityAt: -1 }
				break
			case "oldest":
				sortQuery = { isPinned: -1, createdAt: 1 }
				break
			case "popular":
				sortQuery = { isPinned: -1, commentCount: -1, "reactions.likes": -1 }
				break
			case "trending":
				// Trending = recent activity + high engagement
				sortQuery = { isPinned: -1, lastActivityAt: -1, commentCount: -1 }
				break
			default:
				sortQuery = { isPinned: -1, lastActivityAt: -1 }
		}

		// Fetch posts
		const posts = await DiscussionPosts.find(query)
			.populate({
				path: "userId",
				select: "firstName lastName email",
			})
			.sort(sortQuery)
			.skip(skip)
			.limit(limitNum)
			.lean()
			.exec()

		console.log(`[discussions/list] Found ${posts.length} posts for event ${eventId}`)

		// Get total count
		const total = await DiscussionPosts.countDocuments(query)

		console.log(`[discussions/list] Total posts: ${total}, returning page ${pageNum}`)

		return sendResponse(
			res,
			{
				posts,
				pagination: {
					page: pageNum,
					limit: limitNum,
					total,
					pages: Math.ceil(total / limitNum),
				},
			},
			"Discussion posts fetched successfully",
			true,
			ResCode.OK
		)
	} catch (error: any) {
		console.error("Error fetching discussion posts:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
