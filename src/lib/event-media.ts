import type { IEvent } from "@/models/events/types"

export type EventMediaType = "image" | "video"

export type EventMedia = {
	url: string
	type: EventMediaType
}

/**
 * Coerce whatever ended up in an event's `images` / `videos` field into a clean
 * list of urls.
 *
 * The event page renders from three different sources — the Mongo document, the
 * external v2 API (see pages/[slug].tsx), and the mobile app's own writes to the
 * shared collection — and only the first is schema-checked. A bare string, a null
 * entry or an empty string all reached the banner block before and were rendered
 * as `<img src="">`, or made the whole list look empty.
 */
const toUrlList = (value: unknown): string[] => {
	if (typeof value === "string") return [value.trim()].filter(Boolean)
	if (!Array.isArray(value)) return []
	return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
}

/**
 * Media for an event's banner, in the order the host arranged it.
 *
 * `mediaOrder` (urls across both arrays) wins when present, because `images` and `videos`
 * are separate fields and cannot express a video sitting before an image between them.
 * Without it the order is images-then-videos, which is what every event predating the
 * host-ordering UI needs.
 *
 * Two rules that keep this honest against the mobile app, which writes `images`/`videos`
 * and has never heard of `mediaOrder`:
 *   - a url NOT named in `mediaOrder` still renders, appended in the legacy order. An image
 *     added elsewhere must never vanish from the banner because a stale order didn't list it.
 *   - a `mediaOrder` entry whose url no longer exists is skipped, not rendered as a blank.
 *
 * Single source of truth: never rebuild this inline, or the "No image available" placeholder
 * and the slide count will disagree.
 */
export function eventMedia(event: Partial<IEvent> | null | undefined): EventMedia[] {
	if (!event) return []

	const legacy: EventMedia[] = [
		...toUrlList((event as any).images).map((url) => ({ url, type: "image" as const })),
		...toUrlList((event as any).videos).map((url) => ({ url, type: "video" as const })),
	]

	return applyMediaOrder(legacy, (event as any).mediaOrder)
}

/**
 * Sequence any url-bearing list by a stored `mediaOrder`.
 *
 * Shared with the host's media grid so the arrangement they drag is exactly what the banner
 * renders — two implementations would drift the moment one of them handled a missing url
 * differently. Isomorphic and dependency-free; safe to import in a component.
 */
export function applyMediaOrder<T extends { url: string }>(list: T[], order: unknown): T[] {
	const wanted = toUrlList(order)
	if (wanted.length === 0) return list

	const byUrl = new Map(list.map((m) => [m.url, m]))
	const ordered: T[] = []
	const placed = new Set<string>()

	for (const url of wanted) {
		const media = byUrl.get(url)
		// Skipped, not rendered: the url was removed after the order was saved.
		if (!media || placed.has(url)) continue
		ordered.push(media)
		placed.add(url)
	}

	// Anything the order didn't name — e.g. added by the mobile app — keeps its legacy
	// position at the end rather than disappearing.
	for (const media of list) {
		if (!placed.has(media.url)) ordered.push(media)
	}

	return ordered
}

/**
 * Same filtering as `eventMedia`, but returning the raw url arrays — for
 * normalising a payload before it becomes page props.
 */
export function normalizeEventMediaFields(source: any): { images: string[]; videos: string[] } {
	return {
		images: toUrlList(source?.images),
		videos: toUrlList(source?.videos),
	}
}
