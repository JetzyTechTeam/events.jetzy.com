
import { resolveEventLocation } from "../src/lib/event-helpers";

// Mock global fetch
global.fetch = async (url: any) => {
    console.log("Fetch called with:", url);
    return {
        json: async () => ({
            results: [
                { formatted_address: "123 Test Avenue, New York, NY" }
            ]
        })
    } as any;
};

// Mock process.env
process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "dummy-key";

async function runTest() {
    console.log("Starting test...");

    // Mock Event Object
    const mockEvent = {
        name: "Secret Party",
        location: "Location disclosed after registration",
        coordinates: {
            lat: 40.7128,
            long: -74.0060
        }
    };

    console.log("Before resolution:", mockEvent.location);

    await resolveEventLocation(mockEvent);

    console.log("After resolution:", mockEvent.location);

    if (mockEvent.location === "123 Test Avenue, New York, NY") {
        console.log("✅ TEST PASSED: Location correctly resolved.");
    } else {
        console.error("❌ TEST FAILED: Location not resolved.");
        process.exit(1);
    }
}

runTest();
