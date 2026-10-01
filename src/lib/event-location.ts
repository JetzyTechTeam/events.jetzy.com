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
	coordinates?: { lat?: number | null; long?: number | null; placeId?: string | null } | null
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
 * Did the host PICK this place from the Google dropdown, or type it themselves?
 *
 * Only a dropdown selection may be turned into a Google Maps link (CEO, 2026-10-01): a host who
 * types their own directions — with their own map link in the sentence — gets their words and
 * their link, and nothing we resolved on their behalf. Guessing a map search from free text is
 * how a guest ends up at an orthodontist on the same street as the park.
 *
 * The coordinates ARE the record of that pick — `buildPlaceSelection` is the only thing that
 * writes them, and the forms clear them the moment the host edits the text by hand — so no new
 * field is needed and the mobile app, which also writes coordinates, keeps its map links.
 */
export function locationWasPicked(event: EventLocationLike): boolean {
	const coordinates = event?.coordinates
	if (!coordinates) return false
	if (coordinates.placeId) return true
	return typeof coordinates.lat === "number" && typeof coordinates.long === "number"
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
 * Shown to people who hold a ticket — the confirmation email and the /success page — and never
 * on the public event page: it is useful to someone on their way to the event and noise to
 * someone browsing. Hosts were typing it into the location field for want of anywhere else,
 * which is what corrupted the address strings this helper now has to tolerate.
 */
export function resolveEntrance(event: EventLocationLike): string {
	return (event?.entrance || "").trim()
}

/**
 * A URL a host typed into `location` or `entrance`, and the text around it.
 *
 * Hosts write arrival notes with a shortened Google Maps link in them:
 *
 *   "Central Park South - Close to 59th St and 6th Avenue. Exact location link:
 *    https://maps.app.goo.gl/NkMHdYaLSVghDcBp7?g_st=iw"
 *
 * The confirmation email used to wrap that WHOLE string in a `maps/search/?query=` link, so
 * the one thing the host wanted clicked — their own link — became part of a free-text search
 * query, and the guest was sent to whatever Google made of a sentence with a URL in it.
 * `splitLocationLinks` isolates the urls so only they are clickable (CEO, 2026-10-01).
 */
export type LocationSegment = { type: "text"; value: string } | { type: "link"; value: string; href: string }

/**
 * Deliberately permissive on the left (a bare `www.` counts — hosts omit the scheme) and
 * conservative on the right: anything after whitespace or an angle bracket/quote belongs to
 * the sentence, not the url.
 */
const LOCATION_URL_PATTERN = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi

/**
 * Sentence punctuation that follows a url rather than belonging to it. A closing bracket is
 * only dropped when the url holds no opening one, so `.../(Main)` survives.
 */
const trimUrlTail = (url: string): string => {
	let value = url
	while (value.length > 1) {
		const last = value[value.length - 1]
		if (".,;:!?'\"".includes(last)) {
			value = value.slice(0, -1)
			continue
		}
		if ((last === ")" && !value.includes("(")) || (last === "]" && !value.includes("["))) {
			value = value.slice(0, -1)
			continue
		}
		break
	}
	return value
}

/** Split a host-written string into plain text and the urls inside it, in order. */
export function splitLocationLinks(text: string): LocationSegment[] {
	const source = text || ""
	const segments: LocationSegment[] = []
	let cursor = 0

	for (const match of source.matchAll(LOCATION_URL_PATTERN)) {
		const raw = match[0]
		const start = match.index ?? 0
		const url = trimUrlTail(raw)

		if (start > cursor) segments.push({ type: "text", value: source.slice(cursor, start) })
		segments.push({ type: "link", value: url, href: url.toLowerCase().startsWith("www.") ? `https://${url}` : url })
		cursor = start + url.length
	}

	if (cursor < source.length) segments.push({ type: "text", value: source.slice(cursor) })
	return segments
}

/** Whether the host put a url in the string — i.e. whether they supplied their own link. */
export function containsLocationLink(text: string): boolean {
	return splitLocationLinks(text).some((segment) => segment.type === "link")
}

const escapeHtml = (value: string): string =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * Email markup for a location / entrance string.
 *
 * With a url in it, ONLY the url is a link. With none, the whole string is linked to
 * `fallbackHref` when one is given (that is the Google Maps search for the address, which is
 * the behaviour the venue line has always had) and is plain text otherwise.
 *
 * Text segments are escaped — host-written and previously interpolated raw.
 */
export function locationHtml(text: string, options?: { fallbackHref?: string }): string {
	const anchor = (href: string, label: string) =>
		`<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer" style="color: #F79432; text-decoration: underline;">${escapeHtml(label)}</a>`

	const segments = splitLocationLinks(text)
	if (!segments.some((segment) => segment.type === "link")) {
		const value = (text || "").trim()
		if (!value) return ""
		return options?.fallbackHref ? anchor(options.fallbackHref, value) : escapeHtml(value)
	}

	return segments
		.map((segment) => (segment.type === "link" ? anchor(segment.href, segment.value) : escapeHtml(segment.value)))
		.join("")
}
