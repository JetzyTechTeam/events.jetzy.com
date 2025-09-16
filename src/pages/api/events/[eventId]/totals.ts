import { Bookings } from "@/models/events/bookings";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {//gets total num of tickets/customers
    if (req.method !== "GET") {
        return  res.status(405).json({ message: "Method is not allowed" });
    }

    const { eventId }  = req.query;
    if (!eventId)   return  res.status(400).json({ message:   "Event ID is required" });

    try {
        const bookings = await Bookings.find({    eventId: eventId, isDeleted: false });

        
        const  totalTickets = bookings.reduce((sum, b) => {
        return sum +   b.tickets.reduce((tSum, t) => tSum + t.quantity,   0);
    }, 0);

        //unique guests/customers based on email
        const uniqueGuests = new Set(bookings.map(b => b.customerEmail)).size;

        return res.status(200).json({ totalTickets, uniqueGuests });
    } catch (error) {
        console.error("Error fetching totals:", error);
        return res.status(500).json({ message: "Error fetching totals" });
    }
}
