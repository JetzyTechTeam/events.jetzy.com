import { stripHtml } from "@/utils/text"

/**
 * Event slug rules and URL helpers.
 *
 * Hosts choose their own event URL, and the brief was to be as permissive as possible —
 * spaces, punctuation, accents and emoji are all allowed. Only characters that genuinely
 * cannot survive a URL path are rejected:
 *
 *   /   Next.js `[slug]` matches a single path segment, so this would route as two
 *   ?   terminates the path and starts the query string
 *   #   terminates the path and starts the fragment (never reaches the server)
 *   %   breaks percent-decoding unless it forms a valid escape
 *   \   normalised to `/` by browsers
 *
 * Everything permitted still has to be percent-encoded when a link is built, which is
 * what `eventPath` / `eventUrl` are for. Use them instead of interpolating a slug.
 *
 * Kept free of server-only imports so the create/manage forms validate exactly as the
 * API does. `buildUniqueSlug` is the one server-side export.
 */

/** Characters that cannot appear in a slug, with the reason surfaced to the host. */
const FORBIDDEN_CHARS: Array<{ char: string; label: string }> = [
	{ char: "/", label: "a slash (/)" },
	{ char: "\\", label: "a backslash (\\)" },
	{ char: "?", label: "a question mark (?)" },
	{ char: "#", label: "a hash (#)" },
	{ char: "%", label: "a percent sign (%)" },
]

export const MAX_SLUG_LENGTH = 100

/**
 * Names that would be shadowed by a real route or static asset — an event using one of
 * these would simply be unreachable, because `/[slug]` never gets a chance to match.
 * Derived from the top-level files in `src/pages`, the first-segment directories, and
 * the contents of `public/`.
 */
export const RESERVED_SLUGS = new Set([
	// top-level pages
	"login", "signup", "post-signup", "jetzyqrsignup", "success", "cancel",
	"cancel-booking", "terms", "report-abuse", "404", "500",
	// first-segment directories under src/pages
	"api", "auth", "console", "events", "interests", "plugins", "profile",
	// public/ assets
	"favicon.ico", "imgs", "js", "email", "next.svg", "vercel.svg", "app-store-badge.png",
	// framework / conventional
	"_next", "static", "robots.txt", "sitemap.xml",
])

/** A 24-hex string is ambiguous: `[slug].tsx` falls back to treating one as an ObjectId. */
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i

/** Combining diacritical marks, built from a string so no literal marks sit in the source. */
const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g")

/** True when the string contains a C0/C1 control character or DEL. */
const hasControlChars = (value: string) => {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i)
		if (code < 0x20 || code === 0x7f) return true
	}
	return false
}

export type SlugValidation = { ok: true; slug: string } | { ok: false; reason: string }

export function validateEventSlug(raw: string | null | undefined): SlugValidation {
	const slug = (raw ?? "").trim()

	if (!slug) return { ok: false, reason: "Enter a URL for this event." }

	if (slug.length > MAX_SLUG_LENGTH) {
		return { ok: false, reason: `Keep the URL under ${MAX_SLUG_LENGTH} characters.` }
	}

	for (const { char, label } of FORBIDDEN_CHARS) {
		if (slug.includes(char)) {
			return { ok: false, reason: `The URL can't contain ${label}.` }
		}
	}

	if (hasControlChars(slug)) {
		return { ok: false, reason: "The URL can't contain invisible control characters." }
	}

	if (RESERVED_SLUGS.has(slug.toLowerCase())) {
		return { ok: false, reason: `"${slug}" is reserved by the site. Pick something else.` }
	}

	if (OBJECT_ID_RE.test(slug)) {
		return { ok: false, reason: "That looks like an event ID, which would be ambiguous. Pick something else." }
	}

	return { ok: true, slug }
}

/**
 * Derive a slug from the event name, used when the host leaves the field blank.
 * Returns "" when nothing usable survives (e.g. an emoji-only name) so the caller can
 * fall back to a random id.
 */
export function slugifyFromName(name: string | null | undefined): string {
	if (!name) return ""

	const base = stripHtml(String(name))
		.toLowerCase()
		.normalize("NFKD")
		.replace(DIACRITICS_RE, "")        // "Fête" -> "fete"
		.replace(/['’"]/g, "")        // drop apostrophes instead of turning them into gaps
		.replace(/[^a-z0-9]+/g, "-")       // everything else becomes a separator
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-$/, "")                 // slicing may have left a trailing dash

	// A derived slug must still pass the same rules the host's input does.
	if (!base || RESERVED_SLUGS.has(base) || OBJECT_ID_RE.test(base)) return ""

	return base
}

/** Escape a slug for safe use inside a RegExp — mirrors the lookup in `[slug].tsx`. */
export const escapeForRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Find a free slug, appending -2, -3 … on collision.
 *
 * Matching is CASE-INSENSITIVE because the page lookup falls back to a case-insensitive
 * regex — `MyEvent` and `myevent` would resolve to each other, so they must not coexist.
 *
 * Deliberately does NOT filter `isDeleted`: the unique index has no partial filter, so a
 * soft-deleted event still occupies its slug. Ignoring that would report "available" and
 * then throw E11000 on insert.
 *
 * Server-side only — takes the model as an argument to avoid importing Mongoose into
 * anything the client bundles.
 */
export async function buildUniqueSlug(
	EventsModel: any,
	candidate: string,
	options: { excludeEventId?: string } = {},
): Promise<string> {
	const { excludeEventId } = options

	const isTaken = async (value: string) => {
		const query: Record<string, any> = {
			slug: { $regex: new RegExp(`^${escapeForRegex(value)}$`, "i") },
		}
		if (excludeEventId) query._id = { $ne: excludeEventId }
		const existing = await EventsModel.findOne(query).select("_id").lean()
		return !!existing
	}

	if (!(await isTaken(candidate))) return candidate

	// Leave room for the suffix rather than overflowing MAX_SLUG_LENGTH.
	for (let n = 2; n < 1000; n++) {
		const suffix = `-${n}`
		const trimmed = candidate.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-$/, "")
		const next = `${trimmed}${suffix}`
		if (!(await isTaken(next))) return next
	}

	// Practically unreachable; keeps the return type honest.
	throw new Error("Could not find an available URL for this event.")
}

/** `/my%20event` — always use this instead of interpolating a slug into a path. */
export const eventPath = (slug: string) => `/${encodeURIComponent(slug ?? "")}`

/** `https://events.jetzy.com/my%20event` — trailing slashes on the base are handled. */
export const eventUrl = (baseUrl: string, slug: string) =>
	`${(baseUrl || "https://events.jetzy.com").replace(/\/$/, "")}${eventPath(slug)}`

// There is deliberately no separate "share URL" helper. Private events are unlisted
// rather than invite-only, so every event link — host-facing or guest-facing — is just
// `eventUrl`. The old `?code=` invite gate was removed because owners and admins bypassed
// it, which meant a link missing the code worked for the host and silently failed for
// every guest they sent it to.

/** `/my%20event/album/<id>` for album links. */
export const eventAlbumPath = (slug: string, albumId: string) =>
	`${eventPath(slug)}/album/${encodeURIComponent(albumId ?? "")}`

/** `https://…/my%20event/album/<id>` */
export const eventAlbumUrl = (baseUrl: string, slug: string, albumId: string) =>
	`${(baseUrl || "https://events.jetzy.com").replace(/\/$/, "")}${eventAlbumPath(slug, albumId)}`
