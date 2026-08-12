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
 * Media for an event's banner, images first then videos — the order the banner
 * has always used. Single source of truth: never rebuild this inline, or the
 * "No image available" placeholder and the slide count will disagree.
 */
export function eventMedia(event: Partial<IEvent> | null | undefined): EventMedia[] {
	if (!event) return []
	return [
		...toUrlList((event as any).images).map((url) => ({ url, type: "image" as const })),
		...toUrlList((event as any).videos).map((url) => ({ url, type: "video" as const })),
	]
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
