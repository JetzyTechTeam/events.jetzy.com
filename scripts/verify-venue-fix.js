
const { resolveEventLocation } = require('./src/lib/event-helpers');

async function test() {
    console.log("Testing resolveEventLocation...");
    
    // Test Case 1: Founder/Investor Happy Hour
    const event1 = {
        _id: "69c3f18800c9a06c6042f78b",
        name: "Founder/Investor Happy Hour",
        location: "disclosed after registration"
    };
    await resolveEventLocation(event1);
    console.log("Test Case 1 (Hardcoded):", event1.location === "Nightingale, 37 Carmine St, New York, NY 10014." ? "PASS" : "FAIL", "-", event1.location);

    // Test Case 2: Generic event with venueName
    const event2 = {
        _id: "some_other_id",
        name: "Test Event",
        location: "Location disclosed after registration",
        venueName: "The Secret Garden, London"
    };
    await resolveEventLocation(event2);
    console.log("Test Case 2 (venueName fallback):", event2.location === "The Secret Garden, London" ? "PASS" : "FAIL", "-", event2.location);

    // Test Case 3: Event that shouldn't change
    const event3 = {
        _id: "yet_another_id",
        name: "Public Event",
        location: "Central Park, NY"
    };
    await resolveEventLocation(event3);
    console.log("Test Case 3 (No change):", event3.location === "Central Park, NY" ? "PASS" : "FAIL", "-", event3.location);
}

test().catch(console.error);
