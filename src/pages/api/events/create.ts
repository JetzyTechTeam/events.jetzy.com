// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { generateRandomId, sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerSession(req, res, authOptions)

	try {
		// make sure user is logged-in before creating events
		if (!session) return sendResponse(res, null, "You need to be logged in to create an event.", false, ResCode.UNAUTHORIZED)

		// get the request body
		const { name, datetime, location, interest, privacy, isPaid, amount, desc, externalUrl, image } = req?.body
		// check if the event already exist in the database
		if (await Events.findOne({ name: name?.toLowerCase() }).exec()) return sendResponse(res, null, "Event already exist.", false, ResCode.BAD_REQUEST)

		//  create event
		const event = await Events.create({
			slug: generateRandomId(8, false),
			name,
			datetime: datetime,
			location,
			interest: interest?.toString()?.split(", "),
			privacy,
			isPaid,
			amount,
			desc,
			externalUrl,
			image,
		})
		if (!event) return sendResponse(res, null, "Failed to create event.", false, ResCode.INTERNAL_SERVER_ERROR)

		return sendResponse(res, event, "Event created successfully!", true, ResCode.CREATED)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
