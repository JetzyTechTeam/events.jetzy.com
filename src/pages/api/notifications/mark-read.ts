import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { EventNotifications } from "@/models/notification"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { withDbErrorHandling, handleDbError } from "@/lib/db-error-handler"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const session = await getServerSession(req, res, authOptions)

		if (!session?.user) {
			return sendResponse(res, null, "Unauthorized", false, ResCode.UNAUTHORIZED)
		}

		const { notificationId } = req.body

		if (!notificationId) {
			return sendResponse(res, null, "Notification ID is required", false, ResCode.BAD_REQUEST)
		}

		const notification = await withDbErrorHandling(
			async () => {
				return await EventNotifications.findOneAndUpdate(
					{
						_id: notificationId,
						userId: (session.user as any).id,
					},
					{
						isRead: true,
					},
					{
						new: true,
					},
				).exec()
			},
			{ timeoutMs: 5000, ensureConnection: true },
		)

		if (!notification) {
			return sendResponse(res, null, "Notification not found", false, ResCode.NOT_FOUND)
		}

		return sendResponse(res, notification, "Notification marked as read", true, ResCode.OK)
	} catch (error: any) {
		return handleDbError(res, error, "Failed to mark notification as read")
	}
}
