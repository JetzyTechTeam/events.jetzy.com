import { eventPath, eventUrl, withQuery } from "@/lib/event-slug"

/**
 * "Preview as a guest" — the host's view of their own event page.
 *
 * The problem this solves: a host opening their own event link never sees what a visitor
 * sees. `HostedEvents` unlocks a dozen blocks behind `canManage` (Quick Actions, the
 * bookings / waiting-list / approvals tabs, the guest list, the post-event album controls)
 * and `canSeeLocation` hands the host the real address even when the event is set to
 * disclose it only after booking. So the one person who needs to check the page before
 * sending it out is the one person who cannot see it.
 *
 * The preview deliberately renders the REAL page rather than a mock-up of it, so the two
 * can never drift apart. All the flag does is suppress the host's own privileges for the
 * duration of the visit.
 */
export const PREVIEW_PARAM = "preview"

/**
 * True when the current url asks for guest mode.
 *
 * Accepts the raw Next.js query value, which is `string | string[] | undefined` — a
 * repeated param arrives as an array and must not read as absent.
 */
export const isPreviewQuery = (query: Record<string, any> | undefined): boolean => {
	const raw = query?.[PREVIEW_PARAM]
	const value = Array.isArray(raw) ? raw[0] : raw
	if (value === undefined || value === null) return false
	const normalized = String(value).toLowerCase()
	return normalized !== "" && normalized !== "0" && normalized !== "false"
}

/**
 * `/my%20event?preview=1`.
 *
 * `slugOrId` may be a raw ObjectId: `[slug].tsx` falls back to a `findById` lookup for a
 * 24-hex path, which is what lets the create page offer a preview before it knows the
 * saved slug.
 */
export const previewPath = (slugOrId: string) => `${eventPath(slugOrId)}?${PREVIEW_PARAM}=1`

/** `https://events.jetzy.com/my%20event?preview=1` */
export const previewUrl = (baseUrl: string, slugOrId: string) => `${eventUrl(baseUrl, slugOrId)}?${PREVIEW_PARAM}=1`

/** The same page with guest mode dropped — what "Exit preview" navigates to. */
export const exitPreviewPath = (slugOrId: string, query?: Record<string, any>) => withQuery(eventPath(slugOrId), query, ["slug", PREVIEW_PARAM])
