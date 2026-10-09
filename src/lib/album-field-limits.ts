/**
 * The length limits on an album's text fields — ONE number per field, read by both album write
 * routes and by both places a host types them (the album modal on the event page and the inline
 * editor on the album page).
 *
 * Why this module exists: the limits were `zod.string().max(120)` literals in the two routes and
 * a `maxLength={120}` on ONE of the two inputs. The modal had no cap at all, so a host could type
 * a title the server would refuse — and the refusal read "Invalid album data", which names
 * neither the field nor the limit.
 *
 * Pure and dependency-free, like `event-field-limits.ts`, so a route and a component can both
 * import it.
 */

export const ALBUM_TITLE_LIMIT = 120
export const ALBUM_DESCRIPTION_LIMIT = 2000

/**
 * Counted in UTF-16 units (`.length`), deliberately: that is what the browser's `maxLength` and
 * zod's `.max()` both count, so the input, the counter and the server cannot disagree.
 */
export const albumFieldCounter = (value: string | undefined | null, limit: number): string =>
	`${(value || "").length} / ${limit}`

/** The sentences the host reads in a toast — the same wherever the mistake was made. */
export const ALBUM_FIELD_MESSAGES = {
	titleRequired: "The album needs a title.",
	titleTooLong: `An album title can be at most ${ALBUM_TITLE_LIMIT} characters.`,
	descriptionTooLong: `An album description can be at most ${ALBUM_DESCRIPTION_LIMIT.toLocaleString()} characters.`,
	mediaRequired: "Add at least one photo or video.",
	mediaInvalid: "One of the photos or videos didn't upload properly. Remove it and add it again.",
	// Anything the rules above don't name — a wrong type from a hand-made request, say.
	fallback: "That album couldn't be saved. Check the title and the photos, then try again.",
} as const

/**
 * What to tell the host, in order of what they should fix first. Shared by the two forms so the
 * check that runs before the request says exactly what the server would have said.
 */
export const albumFieldRefusal = (fields: { title: string; description?: string }): string | null => {
	const title = (fields.title || "").trim()
	if (!title) return ALBUM_FIELD_MESSAGES.titleRequired
	if (title.length > ALBUM_TITLE_LIMIT) return ALBUM_FIELD_MESSAGES.titleTooLong
	if ((fields.description || "").trim().length > ALBUM_DESCRIPTION_LIMIT) return ALBUM_FIELD_MESSAGES.descriptionTooLong
	return null
}
