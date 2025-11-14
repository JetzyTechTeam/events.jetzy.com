import { Comments } from "@/models/events/comments"
import { NextApiRequest, NextApiResponse } from "next"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { createEventCommentNotification } from "@/lib/notification-helper"
import { Events } from "@/models/events"
import { Users } from "@/models/userModal"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)

	if (!session) {
		throw new Error("You must be logged in to create a comment")
	}

	const { eventId, comment } = req.body

	if (!eventId || !comment) {
		return res.status(400).json({ message: "Missing EventId or Comment!" })
	}

	try {
		await Comments.create({
			eventId,
			comment,
			// @ts-ignore
			userId: session?.user?._id,
		})

		// Create notification for event creator
		// TODO: Event model doesn't have userId field yet - needs to be added to enable this feature
		/*
		try {
			const event = await Events.findById(eventId)
			if (event && event.userId) {
				// Don't notify if commenter is the event creator
				// @ts-ignore
				if (event.userId.toString() !== session?.user?._id.toString()) {
					// @ts-ignore
					const commenter = await Users.findById(session?.user?._id)
					const commenterName = commenter ? `${commenter.firstName} ${commenter.lastName}` : "Someone"

					await createEventCommentNotification(event.userId, eventId, event.name, commenterName)
					console.log("Comment notification created")
				}
			}
		} catch (notificationError) {
			console.error("Failed to create comment notification:", notificationError)
			// Don't fail the request if notification fails
		}
		*/

		return res.status(200).json({ message: "Comment created successfully" })
	} catch (err) {
		return res.status(500).json({ message: "Something went wrong" })
	}
}
