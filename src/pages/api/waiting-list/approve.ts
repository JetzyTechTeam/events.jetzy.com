import { NextApiRequest, NextApiResponse } from "next"
import { WaitingList } from "@/models/waitingList"
import { sendResponse } from "@/lib/helpers"
import { ResCode } from "@/lib/responseCodes"
import { sendWaitingListApproval } from "@/lib/send-grid"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return sendResponse(res, null, "Method not allowed", false, ResCode.BAD_REQUEST)
	}

	try {
		const { waitingListId, eventName } = req.body

		if (!waitingListId) {
			return sendResponse(res, null, "Waiting list ID is required", false, ResCode.BAD_REQUEST)
		}

		// Find the waiting list entry
		const waitingListEntry = await WaitingList.findById(waitingListId)
		
		if (!waitingListEntry) {
			return sendResponse(res, null, "Waiting list entry not found", false, ResCode.NOT_FOUND)
		}

		// Update status to notified
		await WaitingList.findByIdAndUpdate(waitingListId, { status: 'notified' })

		// Send approval email
		try {
			await sendWaitingListApproval({
				firstName: waitingListEntry.firstName,
				lastName: waitingListEntry.lastName,
				email: waitingListEntry.email,
				eventName: eventName || "Event",
				tickets: waitingListEntry.tickets,
			})
		} catch (emailError) {
			console.error("Failed to send approval email:", emailError)
			// Don't fail the request if email fails
		}

		return sendResponse(res, { success: true }, "User approved and notified successfully", true, ResCode.OK)
	} catch (error: any) {
		console.error("Error approving waiting list user:", error)
		return sendResponse(res, null, "Failed to approve user", false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
