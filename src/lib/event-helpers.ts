
import { IEvent } from "@/models/events/types";

export const resolveEventLocation = async (event: IEvent | any) => {
    const eventId = String(event._id);
    
    // Check for hardcoded event venues
    const hardcodedVenues: Record<string, string> = {
        "69406b0aecf5f8dab077a1dc": "Bar Sella, Hyatt Union Square, 134 4th Ave, New York, NY 10003.",
        "697cf23827f6f5f0d7d8c25a": "Nightingale, 37 Carmine St, New York, NY 10014.",
        "698643a2a2b2892a70c68c08": "The Vesper, 394 E Campbell Ave, Campbell, CA 95008, United States",
        "698a27d43c43238502823ddf": "11520 W Pico Blvd, Los Angeles, CA 90064, United States",
        "69c3f18800c9a06c6042f78b": "Nightingale, 37 Carmine St, New York, NY 10014." // Founder/Investor Happy Hour
    };

    if (hardcodedVenues[eventId]) {
        event.location = hardcodedVenues[eventId];
        return;
    }

    // Check if location is hidden or empty, try to use venueName
    const locationLower = (event.location || "").toLowerCase();
    const isHidden = !event.location || 
                   locationLower.includes("disclosed after registration") || 
                   locationLower.includes("location hidden");

    if (isHidden && event.venueName && event.venueName.trim() !== "") {
        event.location = event.venueName;
        return;
    }

    // If location is hidden and reverse geocode if needed
    if (isHidden && event.coordinates && (event.coordinates.lat || event.coordinates.long)) {
        try {
            const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
            if (apiKey) {
                const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${event.coordinates.lat},${event.coordinates.long}&key=${apiKey}`;
                const geocodeRes = await fetch(geocodeUrl);
                const geocodeData = await geocodeRes.json();

                if (geocodeData.results && geocodeData.results.length > 0) {
                    event.location = geocodeData.results[0].formatted_address;
                }
            }
        } catch (geoError) {
            console.error("Geocoding failed:", geoError);
        }
    }
};
