import { eventUrl } from "@/lib/event-slug"

/**
 * Marketing links — pure, client-safe. Server lookups live in `marketing-link-server.ts`.
 *
 * A marketing link is `<event url>?mk=<tag>`. It is ATTRIBUTION ONLY and deliberately a
 * different parameter from `?ref=`: `ref` is a discount code that checkout validates and
 * refuses (400) when invalid, so it can never double as a free-form source tag. A link may
 * still carry a referral code; the landing page then stashes it where `?ref=` would.
 *
 * Attribution is LAST TOUCH, remembered for MARKETING_ATTRIBUTION_DAYS per EVENT in
 * localStorage: a visitor who opens the Instagram link today and returns with a bare URL next
 * week to buy is still credited to Instagram, and a later Partiful click takes the credit over.
 * Keyed per event, so one event's link never credits a purchase on another.
 */

export const MK_PARAM = "mk"
export const MARKETING_ATTRIBUTION_DAYS = 30
export const MARKETING_TAG_MAX = 40

const TOUCH_KEY_PREFIX = "jetzy_mk:"
const DAY_MS = 24 * 60 * 60 * 1000

/** Presets offered when creating a link. `platform` itself is a free string. */
export const MARKETING_PLATFORMS: Array<{ key: string; label: string }> = [
	{ key: "facebook", label: "Facebook" },
	{ key: "instagram", label: "Instagram" },
	{ key: "partiful", label: "Partiful" },
	{ key: "tiktok", label: "TikTok" },
	{ key: "whatsapp", label: "WhatsApp" },
	{ key: "x", label: "X (Twitter)" },
	{ key: "linkedin", label: "LinkedIn" },
	{ key: "email", label: "Email" },
	{ key: "other", label: "Other" },
]

export const marketingPlatformLabel = (platform?: string | null) =>
	MARKETING_PLATFORMS.find((p) => p.key === platform)?.label || (platform ? platform : "Other")

/** Lowercase, spaces/underscores → hyphens, anything else outside `[a-z0-9-]` dropped. */
export function normalizeMarketingTag(raw: unknown): string {
	if (typeof raw !== "string") return ""
	return raw
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, MARKETING_TAG_MAX)
}

/** Null when valid, else a sentence the host can act on. Judges the NORMALISED tag. */
export function validateMarketingTag(tag: string): string | null {
	if (!tag) return "Enter a tag for the link (letters, numbers and hyphens)."
	if (tag.length > MARKETING_TAG_MAX) return `The tag can be at most ${MARKETING_TAG_MAX} characters.`
	if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(tag)) return "Use letters, numbers and hyphens only."
	return null
}

/** `instagram`, then `instagram-2`, `instagram-3`… — the first not in `taken`. */
export function suggestMarketingTag(base: string, taken: Iterable<string>): string {
	const root = normalizeMarketingTag(base) || "link"
	const used = new Set(Array.from(taken, (t) => t.toLowerCase()))
	if (!used.has(root)) return root
	for (let n = 2; n < 1000; n++) {
		const candidate = `${root.slice(0, MARKETING_TAG_MAX - String(n).length - 1)}-${n}`
		if (!used.has(candidate)) return candidate
	}
	return `${root}-${Date.now().toString(36)}`.slice(0, MARKETING_TAG_MAX)
}

/** `https://events.jetzy.com/my%20event?mk=instagram` — slug always through `eventUrl`. */
export const marketingLinkUrl = (baseUrl: string, slug: string, tag: string) =>
	`${eventUrl(baseUrl, slug)}?${MK_PARAM}=${encodeURIComponent(tag)}`

/**
 * Where a booking came from, for the "via <link>" chip on Bookings, Guests and the event page.
 * `marketingLinkLabel` is attached server-side (`attachMarketingLinkLabels`); the stored tag is
 * the fallback when that lookup didn't run. Null = direct, which renders nothing.
 */
export function bookingMarketingSource(booking: any): { label: string; platform: string | null } | null {
	if (!booking?.marketingLinkId && !booking?.marketingLinkTag) return null
	const label = booking.marketingLinkLabel || booking.marketingLinkTag
	return label ? { label: String(label), platform: booking.marketingLinkPlatform || null } : null
}

export type MarketingTouch = { linkId: string; tag: string; at: number }

/** Last touch wins — a new link click overwrites whatever was stored for this event. */
export function rememberMarketingTouch(eventId: string, touch: { linkId: string; tag: string }) {
	if (!eventId || !touch?.linkId) return
	try {
		window.localStorage.setItem(
			`${TOUCH_KEY_PREFIX}${eventId}`,
			JSON.stringify({ linkId: touch.linkId, tag: touch.tag, at: Date.now() } satisfies MarketingTouch),
		)
	} catch {
		// Private mode / blocked storage: no attribution, nothing else breaks.
	}
}

/** The touch for this event, or null when none, malformed, or older than the window. */
export function readMarketingTouch(eventId: string | undefined | null): MarketingTouch | null {
	if (!eventId) return null
	try {
		const raw = window.localStorage.getItem(`${TOUCH_KEY_PREFIX}${eventId}`)
		if (!raw) return null
		const parsed = JSON.parse(raw)
		if (!parsed || typeof parsed.linkId !== "string" || typeof parsed.at !== "number") return null
		if (Date.now() - parsed.at > MARKETING_ATTRIBUTION_DAYS * DAY_MS) return null
		return { linkId: parsed.linkId, tag: String(parsed.tag || ""), at: parsed.at }
	} catch {
		return null
	}
}
