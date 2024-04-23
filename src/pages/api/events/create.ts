// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { sendResponse } from "@Jetzy/lib/helpers"
import { ResCode } from "@Jetzy/lib/responseCodes"
import { Users } from "@Jetzy/models/userModal"
import { Roles } from "@Jetzy/types"
import type { NextApiRequest, NextApiResponse } from "next"
import bcrypt from "bcrypt"
import { Events } from "@Jetzy/models/eventsModal"

type Data = {
  firstName: string
  lastName: string
  email: string
  password: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  try {
    // get the request body
    const { name, datetime, location, interest, privacy, isPaid, amount, desc, image } = req?.body
    // check if the event already exist in the database
    if (await Events.findOne({ name: name?.toLowerCase() }).exec()) return sendResponse(res, null, "Event already exist.", false, ResCode.BAD_REQUEST)

    //  create event
    const event = await Events.create({ name, datetime, location, interest: interest?.toString()?.split(", "), privacy, isPaid, amount, desc, image })
    if (!event) return sendResponse(res, null, "Failed to create event.", false, ResCode.INTERNAL_SERVER_ERROR)

    return sendResponse(res, event, "Event created successfully!", true, ResCode.CREATED)
  } catch (error: any) {
    console.log("Error:", error.message)
    return sendResponse(res, null, error.message, false, ResCode.INTERNAL_SERVER_ERROR)
  }
}
