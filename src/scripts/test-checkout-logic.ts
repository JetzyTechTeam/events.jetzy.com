
import { Types } from "mongoose";

async function test() {
    const tickets = [{
        id: "697cfb6e20b2abe2ab4475e5",
        name: "Early bird Ticket",
        price: 25,
        description: "Valid till Feb 3rd ",
        quantity: 1,
        isSelected: true,
        priceId: "price_1SvMdeB7XccR5GE01X44bS1I",
        eventId: "697cf23827f6f5f0d7d8c25a"
    }];

    const referralCode = "SHAMA100";

    console.log("Testing logic...");

    try {
        // Simulate line 88
        console.log("Attempting to create ObjectId from:", tickets[0]?.eventId);
        const eventId = new Types.ObjectId(tickets[0]?.eventId);
        console.log("ObjectId created successfully:", eventId);

        // Simulate model usage (this won't work without actual DB but we check the Types part)
        console.log("Validation passed.");
    } catch (error: any) {
        console.error("CRASHED:", error.message);
    }
}

test();
