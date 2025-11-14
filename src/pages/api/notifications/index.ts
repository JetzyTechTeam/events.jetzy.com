import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { EventNotifications } from "@/models/notification"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { withDbErrorHandling, handleDbError } from "@/lib/db-error-handler"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		const session = await getServerSession(req, res, authOptions)

		if (!session?.user) {
			return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		}

		if (req.method === "GET") {
			// Fetch notifications for the logged-in user
			const { limit = 20, unreadOnly = "false" } = req.query

			const query: any = { userId: (session.user as any).id }

			if (unreadOnly === "true") {
				query.isRead = false
			}

			// Wrap database operations with timeout and error handling
			const { notifications, unreadCount } = await withDbErrorHandling(
				async () => {
					const [notificationsList, count] = await Promise.all([
						EventNotifications.find(query)
							.sort({ createdAt: -1 })
							.limit(parseInt(limit as string))
							.lean()
							.exec(),
						EventNotifications.countDocuments({
							userId: (session.user as any).id,
							isRead: false,
						}).exec(),
					])
					return { notifications: notificationsList, unreadCount: count }
				},
				{ timeoutMs: 10000, ensureConnection: true },
			)

			return sendResponse(
				res,
				{
					notifications,
					unreadCount,
				},
				"Notifications fetched successfully",
				true,
				ResCode.OK,
			)
		}

		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	} catch (error: any) {
		return handleDbError(res, error, "Failed to fetch notifications")
	}
}
