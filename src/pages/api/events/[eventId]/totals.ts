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
        const allBookings = await Bookings.find({ eventId: eventId, isDeleted: false });

        // register-only booking with no tickets = 1 spot
        const ticketCount = (bookings: typeof allBookings) =>
            bookings.reduce((sum, b) => {
                const qty = b.tickets.reduce((tSum, t) => tSum + t.quantity, 0);
                return sum + (qty > 0 ? qty : 1);
            }, 0);
        const guestCount = (bookings: typeof allBookings) =>
            new Set(bookings.map(b => b.customerEmail)).size;

        // "Active" means actually attending. Rejected and failed (expired card hold)
        // bookings are as dead as cancelled ones, and a pending approval request hasn't
        // consumed a seat yet — the event tracker only increments on approval, so counting
        // any of these as active would overstate attendance.
        const isInactive = (b: (typeof allBookings)[number]) =>
            b.status === BookingStatus.CANCELLED ||
            b.status === BookingStatus.REJECTED ||
            b.status === BookingStatus.FAILED;

        const activeBookings = allBookings.filter(b => !isInactive(b) && b.status !== BookingStatus.PENDING);
        const inactiveBookings = allBookings.filter(isInactive);
        const pendingBookings = allBookings.filter(b => b.status === BookingStatus.PENDING);

        return res.status(200).json({
            totalTickets: ticketCount(activeBookings),
            uniqueGuests: guestCount(activeBookings),
            // Key name kept for backwards compatibility; now covers cancelled + rejected + expired.
            cancelledTickets: ticketCount(inactiveBookings),
            cancelledGuests: guestCount(inactiveBookings),
            pendingTickets: ticketCount(pendingBookings),
            pendingGuests: guestCount(pendingBookings),
        });
    } catch (error) {
        console.error("Error fetching totals:", error);
        return res.status(500).json({ message: "Error fetching totals" });
    }
}
