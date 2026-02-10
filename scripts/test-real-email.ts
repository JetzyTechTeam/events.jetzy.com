import * as dotenv from "dotenv";
dotenv.config();

import { sendTicketConfirmation } from "../src/lib/send-grid";
import { IEvent } from "../src/models/events/types";

const run = async () => {
    const testEmail = process.argv[2] || "raoarsalanlatif@gmail.com";
    console.log(`Preparing to send email to: ${testEmail}...`);

    const mockEvent: IEvent = {
        name: "Annual Networking Gala - New York",
        images: ["https://placehold.co/600x400"],
        location: "Bar Sella, Hyatt Union Square, 134 4th Ave, New York, NY 10003",
        startsOn: new Date("2026-12-31T19:00:00"),
        endsOn: new Date("2027-01-01T03:00:00"),
        timezone: "America/New_York",
        _id: "69406b0aecf5f8dab077a1dc" as any,
        slug: "networking-gala",
        showParticipants: true,
        coordinates: { lat: 40.7, long: -74.0, placeId: "pid" },
        desc: "Join us for our annual networking gala.",
        isPaid: true,
        capacity: 100,
        requireApproval: false,
        privacy: "public",
        tickets: [],
        createEventTracker: async () => ({} as any),
        getBookings: async () => ([]),
        deleteTracker: async () => { },
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        toJSON: () => ({}),
    };

    try {
        await sendTicketConfirmation({
            event: mockEvent,
            firstName: "Arsalan",
            lastName: "Rao",
            email: testEmail,
            phone: "+1234567890",
            tickets: [
                {
                    name: "VIP Admission",
                    quantity: 2,
                    price: 50.0,
                    desc: "Includes backstage access",
                },
            ],
            orderNumber: "TEST-ORDER-123",
            referralCode: "TESTREF",
            discountAmount: 10.0,
            discountPercentage: 10,
        });
        console.log("Email sent successfully!");
    } catch (error) {
        console.error("Error sending email:", error);
    }
};

run();
