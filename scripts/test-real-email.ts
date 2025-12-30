
// Set environment variables BEFORE importing send-grid
// process.env.SENDGRID_API_KEY = "YOUR_API_KEY";
// process.env.SENDGRID_EMAIL_SENDER = "marketing@jetzyapp.com";

import { sendTicketConfirmation } from "../src/lib/send-grid";
import { IEvent } from "../src/models/events/types";

const run = async () => {
    console.log("Preparing to send email...");

    const mockEvent: IEvent = {
        name: "Real Email Test Event",
        images: ["https://placehold.co/600x400"],
        location: "123 Real Test St, New York, NY", // Hardcoded resolved location
        startsOn: new Date("2025-12-31T19:00:00"),
        endsOn: new Date("2025-12-31T22:00:00"),
        timezone: "America/New_York",
        _id: "mock_event_id" as any,
        slug: "real-test-event",
        showParticipants: true,
        coordinates: { lat: 40.7, long: -74.0, placeId: "pid" },
        desc: "Test description",
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
            email: "raoarsalanlatif@gmail.com",
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
