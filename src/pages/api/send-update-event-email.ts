import type { NextApiRequest, NextApiResponse } from "next"
import { sendUpdateEventEmail } from "@/actions/send-update-email-to-users.action"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const {
      eventName,
      oldEventName,
      location,
      oldLocation,
      startDate,
      oldStartDate,
      endDate,
      oldEndDate,
      endTime,
      oldEndTime,
      startTime,
      oldStartTime,
      userEmail
    } = req.body

    if (
      !eventName || !oldEventName || !location || !oldLocation ||
      !startDate || !oldStartDate || !endDate || !oldEndDate ||
      !endTime || !oldEndTime || !startTime || !oldStartTime || !userEmail
    ) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const data = {
        eventName,
        oldEventName,
        location,
        oldLocation,
        startDate,
        oldStartDate,
        endDate,
        oldEndDate,
        endTime,
        oldEndTime,
        startTime,
        oldStartTime,
        userEmail
    }

    await sendUpdateEventEmail(data)

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error("Error sending event update email:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
}