
import { IEvent } from "@/models/events/types";

export const resolveEventLocation = async (event: IEvent | any) => {
    // Check if location is hidden and reverse geocode if needed
    if (event.location && event.location.toLowerCase().includes("disclosed") && event.coordinates && (event.coordinates.lat || event.coordinates.long)) {
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
