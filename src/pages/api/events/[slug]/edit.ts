// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@/models/events"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		// get event update data
		const { name, datetime, location, interest, privacy, isPaid, amount, desc, externalUrl, image } = req?.body

		//  get an event by its slug or id
		let event
		try {
			event = await Events.findOne({ _id: req?.query?.slug }).exec()
		} catch (error: any) {
			if (error?.message?.includes("Cast to ObjectId failed")) {
				event = await Events.findOne({ slug: req?.query?.slug }).exec()
			}
		}
		if (!event) return sendResponse(res, null, "Event not found.", false, ResCode.NOT_FOUND)

		// Update event
		const updatedEvent = await Events.findByIdAndUpdate(
			event?._id,
			{ name, datetime: datetime, location, interest: interest?.toString()?.split(", "), privacy, isPaid, amount, desc, externalUrl, image },
			{ new: true },
		).exec()
		if (!updatedEvent) return sendResponse(res, null, "Failed to update event.", false, ResCode.INTERNAL_SERVER_ERROR)

		return sendResponse(res, updatedEvent, "Event updated successfully!", true, ResCode.OK)
	} catch (error: any) {
		console.log("Error:", error.message)
		return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
	}
}
