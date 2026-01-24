import { Bookings } from "@/models/events/bookings";
import { BookingStatus } from "@/models/events/types";
import { NextApiRequest, NextApiResponse } from "next";

import { dbconn } from "@/configs/database";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {//gets total num of tickets/customers
    await dbconn.asPromise();

    if (req.method !== "GET") {
        return res.status(405).json({ message: "Method is not allowed" });
    }

    const { eventId } = req.query;
    if (!eventId) return res.status(400).json({ message: "Event ID is required" });

    try {
        // Get all bookings (including cancelled for separate count)
        const allBookings = await Bookings.find({ eventId: eventId, isDeleted: false });

        // Filter out cancelled bookings for main counts
        const activeBookings = allBookings.filter(b => b.status !== BookingStatus.CANCELLED);

        // Calculate active ticket counts
        const totalTickets = activeBookings.reduce((sum, b) => {
            return sum + b.tickets.reduce((tSum, t) => tSum + t.quantity, 0);
        }, 0);

        // Calculate cancelled ticket counts
        const cancelledTickets = allBookings
            .filter(b => b.status === BookingStatus.CANCELLED)
            .reduce((sum, b) => {
                return sum + b.tickets.reduce((tSum, t) => tSum + t.quantity, 0);
            }, 0);

        //unique guests/customers based on email (excluding cancelled)
        const uniqueGuests = new Set(activeBookings.map(b => b.customerEmail)).size;

        //unique cancelled guests
        const cancelledGuests = new Set(
            allBookings
                .filter(b => b.status === BookingStatus.CANCELLED)
                .map(b => b.customerEmail)
        ).size;

        return res.status(200).json({
            totalTickets,
            uniqueGuests,
            cancelledTickets,
            cancelledGuests
        });
    } catch (error) {
        console.error("Error fetching totals:", error);
        return res.status(500).json({ message: "Error fetching totals" });
    }
}
