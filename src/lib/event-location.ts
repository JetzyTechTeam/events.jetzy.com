/**
 * How an event's location is presented to a guest, and how to link it to a map.
 *
 * `event.location` is now self-sufficient: the Places picker stores
 * `"<venue>, <full address>"` (see `src/lib/google-place.ts`), so the venue name is already
 * in the string. `event.venueName` holds the venue on its own and exists only as a FALLBACK
 * for events whose location is blank or masked.
 *
 * It used to be a PREFIX — `send-grid.ts` prepended `venueName` whenever
 * `!location.includes(venueName)`. That produced:
 *
 *   Venue: Mineral Springs, Central Park, W 70th St, New York, NY 10019, USA, West side at
 *          69th stree, Mineral Springs, Central Park, W 70th St, New York, NY 10019, USA.
 *          Entrance - West side at 69th stree
 *
 * A verbatim `includes` can't recognise "the same place written slightly differently", and
 * once the picker started writing the venue into `location` the prefix had nothing left to
 * add anyway. Prefixing is gone; the fallback stays.
 */

type EventLocationLike = {
	location?: string | null
	venueName?: string | null
	entrance?: string | null
} | null | undefined

/** A location that is deliberately withheld from the public event page. */
const isMaskedLocation = (location: string): boolean => {
	const lower = location.toLowerCase()
	return !location.trim() || lower.includes("disclosed after registration") || lower.includes("location hidden")
}

/**
 * The address to show a guest who has already booked — emails and the success page.
 *
 * `locationDisclosedAfterBooking` only masks the PUBLIC event page; someone holding a ticket
 * is entitled to the real address, so this never masks.
 */
export function resolveGuestLocation(event: EventLocationLike): string {
	const location = (event?.location || "").trim()
	const venueName = (event?.venueName || "").trim()

	// Only substitute when there is nothing usable to show. Never concatenate the two.
	if (isMaskedLocation(location) && venueName) return venueName
	return location
}

/**
 * Google Maps link for a location string.
 *
 * `search/?api=1&query=` is the documented universal URL — it resolves a free-text address on
 * every platform and opens the native app on mobile, so it survives the venue name being part
 * of the string.
 */
export function mapsLinkFor(location: string): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`
}

/**
 * Entrance / arrival instructions, e.g. "West side at 69th Street".
 *
 * Deliberately email-only: it is useful to someone on their way to the event and noise to
 * someone browsing. Hosts were typing it into the location field for want of anywhere else,
 * which is what corrupted the address strings this helper now has to tolerate.
 */
export function resolveEntrance(event: EventLocationLike): string {
	return (event?.entrance || "").trim()
}
