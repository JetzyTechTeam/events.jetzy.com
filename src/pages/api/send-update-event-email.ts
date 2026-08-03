import type { NextApiRequest, NextApiResponse } from "next"
import { sendUpdateEventEmailLogic as sendUpdateEventEmail } from "@/lib/email-service"

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
      userEmail,
      changes,
      eventLink
    } = req.body

    // Only the recipient is genuinely required. Dates and times are optional on events
    // now (date polls, TBD dates, hasStartTime/hasEndTime false), and location can be
    // blank — the previous check demanded all twelve fields be truthy, so any event
    // missing an end time silently 400'd and no update email was ever sent.
    if (!userEmail) {
      return res.status(400).json({ error: "userEmail is required" })
    }

    const data = {
      eventName: eventName || oldEventName || "Your event",
      oldEventName: oldEventName || eventName || "Your event",
      location: location || "",
      oldLocation: oldLocation || "",
      startDate: startDate || "",
      oldStartDate: oldStartDate || "",
      endDate: endDate || "",
      oldEndDate: oldEndDate || "",
      endTime: endTime || "",
      oldEndTime: oldEndTime || "",
      startTime: startTime || "",
      oldStartTime: oldStartTime || "",
      userEmail,
      changes,
      eventLink
    }

    await sendUpdateEventEmail(data)

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error("Error sending event update email:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
}