// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import type { NextApiRequest, NextApiResponse } from "next"
import { Events } from "@Jetzy/models/eventsModal"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
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

    return sendResponse(res, event, "Event retrieved successfully!", true, ResCode.OK)
  } catch (error: any) {
    console.log("Error:", error.message)
    return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
  }
}
