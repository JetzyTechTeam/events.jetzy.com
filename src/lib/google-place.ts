/**
 * Turning a Google Places selection into the fields we store.
 *
 * The event forms used to write `place.formatted_address` alone, which threw away the venue
 * name: picking "Mineral Springs, Central Park" left the field reading
 * "W 70th St, New York, NY 10019, USA". `place.name` was even requested in the widget's
 * `fields` list and then never read.
 *
 * That one omission is the reason a whole chain of downstream patches exists — the
 * `venueName` fallback in `send-grid.ts` and `success.tsx`, and the hardcoded
 * event-id → venue map in `event-helpers.ts`. Nothing ever wrote `venueName` from the UI,
 * so venue names had to be pasted in by hand, event by event.
 *
 * Both event forms go through here so the two copies of the autocomplete can't drift again.
 */

export type PlaceSelection = {
	/** What the buyer sees, and what is stored on `event.location`. */
	location: string
	/** The venue on its own, stored on `event.venueName`. Empty for a plain address. */
	venueName: string
	latitude?: number
	longitude?: number
	placeId?: string
}

type PlaceLike = {
	name?: string
	formatted_address?: string
	place_id?: string
	geometry?: { location?: { lat: () => number; lng: () => number } }
}

/**
 * Build the stored fields from a resolved `PlaceResult`.
 *
 * `location` is `name, formatted_address` — the closest reproduction of the dropdown row the
 * user actually clicked, while keeping the full postal address that maps, directions and the
 * geocoder depend on.
 *
 * The name is skipped when `formatted_address` already begins with it (Google does this for
 * some places), so nothing comes out as "Nightingale, Nightingale, 37 Carmine St".
 */
export function buildPlaceSelection(place: PlaceLike | null | undefined): PlaceSelection {
	const name = (place?.name || "").trim()
	const address = (place?.formatted_address || "").trim()

	let location = address
	if (name) {
		const alreadyLeadsWithName = address.toLowerCase().startsWith(name.toLowerCase())
		// A pure street address comes back with `name` equal to the street line, which would
		// otherwise duplicate it. `alreadyLeadsWithName` catches that case too.
		location = !address ? name : alreadyLeadsWithName ? address : `${name}, ${address}`
	}

	const lat = place?.geometry?.location?.lat?.()
	const lng = place?.geometry?.location?.lng?.()

	return {
		location,
		// Only a real venue name — never the street line echoed back as a "name".
		venueName: name && !address.toLowerCase().startsWith(name.toLowerCase()) ? name : "",
		latitude: typeof lat === "number" ? lat : undefined,
		longitude: typeof lng === "number" ? lng : undefined,
		placeId: place?.place_id,
	}
}

/**
 * Google's autocomplete dropdown (`.pac-container`) re-queries when the input regains focus,
 * so clicking back into a saved location fired a fresh search for the stored text. With
 * `types: ["establishment"]` that returned unrelated businesses on the same street — the
 * user picks a park and, on returning, is offered an orthodontist.
 *
 * The widget owns that listener, so rather than fight it we hide the dropdown until the
 * value is actually edited. Paired with `autoComplete="off"` on the input, which Google's
 * own docs require and which was missing — without it the browser's saved-form-data list
 * appears over the top as well.
 */
export const PAC_HIDDEN_CLASS = "jetzy-hide-pac"

export function suppressPlacesDropdown() {
	if (typeof document !== "undefined") document.body.classList.add(PAC_HIDDEN_CLASS)
}

export function allowPlacesDropdown() {
	if (typeof document !== "undefined") document.body.classList.remove(PAC_HIDDEN_CLASS)
}
