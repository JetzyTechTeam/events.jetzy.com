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

		await withDbErrorHandling(
			async () => {
				return await EventNotifications.updateMany(
					{
						userId: (session.user as any).id,
						isRead: false,
					},
					{
						isRead: true,
					},
				).exec()
			},
			{ timeoutMs: 5000, ensureConnection: true },
		)

		return sendResponse(res, null, "All notifications marked as read", true, ResCode.OK)
	} catch (error: any) {
		return handleDbError(res, error, "Failed to mark all notifications as read")
	}
}
