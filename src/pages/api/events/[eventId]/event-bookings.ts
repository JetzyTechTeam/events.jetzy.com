import { Bookings } from "@/models/events/bookings";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ message: "Event ID is required" });
  }

  try {
    // Ensure database connection is ready
    const { dbconn } = await import("@/configs/database")
    if (dbconn.readyState !== 1) {
      console.log("[event-bookings] Database not connected, attempting to connect...")
      try {
        await Promise.race([
          dbconn.asPromise(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Connection timeout")), 30000)
          )
        ])
      } catch (connError: any) {
        console.error("[event-bookings] Database connection failed:", connError.message)
        return res.status(500).json({ message: "Database connection failed" })
      }
    }

    const bookings = await Bookings.find({ eventId: eventId });

    return res.status(200).json(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({ message: "Error fetching bookings" });
  }
}
