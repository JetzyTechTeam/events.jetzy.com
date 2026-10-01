/**
 * How long an event title may be.
 *
 * The cap is 150 characters THAT ARE NOT WHITESPACE. Spaces are free, and there is no limit on how
 * many of them a title may hold.
 *
 * Two separate things were wrong with the old native `maxLength={100}`. Spaces spent the budget, so
 * a sentence-style title lost roughly a sixth of the field to the spacebar and felt far shorter than
 * the number promised — that is the complaint the CEO actually hit. And 100 characters is about 20
 * English words, not the 30 that was asked for: 30 words is ~150 non-space characters. Freeing
 * spaces WITHOUT raising the number would still have fitted only ~20 words; raising the number
 * without freeing spaces would have let a single-word title run 150 characters wide and overflow
 * every card and preview that renders it. Both together fit a 30-word title while leaving the widest
 * possible title exactly as wide as it was before.
 *
 * `EVENT_TITLE_RAW_LIMIT` is a backstop, not the product rule. Once spaces cost nothing a held
 * spacebar or a pasted blob of whitespace has no upper bound, and nothing downstream would catch it:
 * `api/events/create.ts` and `api/events/[eventId]/update.ts` both validate `name` as
 * `zod.string().nonempty()` with no max, and the Mongoose field has no `maxlength`. It is the same
 * number `api/events/[eventId]/details.ts` enforces — that is where the inline editor on the event
 * page posts a title — so a title this module accepts can never be one that endpoint 400s.
 *
 * The create/update schemas are deliberately left alone. A hard max on `name` there would make every
 * event already carrying a longer title unsavable: a host could not fix a typo in the description
 * without first shortening the name. That is the same grandfathering trap documented at the top of
 * `event-media-limit.ts`. Like the 500-character description cap this is a client-side authoring
 * rule, and an over-limit title stays editable — `isEventTitleOverLimit` exists so the counter can
 * say so instead of the field looking broken.
 *
 * Counting is by CODE POINT, not UTF-16 code unit. An emoji has `.length === 2`, so a `.length`-based
 * budget charges it double; worse, `slice(0, n)` can cut a surrogate pair in half and leave a lone
 * surrogate — a tofu box — in the saved title. Walking code points makes both impossible, because the
 * count and the truncation then use the same unit. Grapheme clusters via `Intl.Segmenter` would be
 * more correct still (a family emoji is five code points) but that is a locale-aware object on a
 * per-keystroke path, and no real title is decided by it.
 *
 * Nothing here calls `stripHtml`, unlike the description counters. The description IS HTML; the title
 * is a plain text input. Stripping it would delete any `<...>`-shaped run a host legitimately typed
 * ("Me <3 you > you" loses eight characters to the tag regex), and `stripHtml` also trims, which
 * would make the counter stutter while the host is mid-word — the precise behaviour this change
 * exists to make legible.
 */

export const EVENT_TITLE_LIMIT = 150

export const EVENT_TITLE_RAW_LIMIT = 500

/** Rendered beside the field label, the way `BenefitsField` renders its own `(Max 23 chars)`. */
export const EVENT_TITLE_LIMIT_HINT = `(Max ${EVENT_TITLE_LIMIT} chars, spaces don't count)`

/**
 * Characters that cost nothing.
 *
 * `\s` with the `u` flag is already the unicode-aware set: ASCII whitespace plus NBSP (U+00A0, what
 * `stripHtml` decodes `&nbsp;` into), the U+2000 block, the line and paragraph separators and the
 * ideographic space U+3000 — so a title pasted out of Word or written in Japanese is charged the same
 * way as one typed here. Zero-width characters (U+200B and friends) are deliberately NOT free: they
 * are invisible, and free invisible padding is an unbounded hole.
 */
const isFreeChar = (ch: string) => /^\s$/u.test(ch)

/**
 * How much of the budget a title has spent: its length in code points, ignoring whitespace.
 *
 * This is the number the counter shows, so it must be the same function the clamp bills with — a
 * counter computed any other way will disagree with the field that stops accepting input.
 */
export const eventTitleLength = (value: string): number => {
	let used = 0
	for (const ch of value ?? "") if (!isFreeChar(ch)) used++
	return used
}

/** The "42/150" string, so the three title fields cannot render different numbers. */
export const eventTitleCounter = (value: string): string => `${eventTitleLength(value)}/${EVENT_TITLE_LIMIT}`

/**
 * True for a title already past the cap — a legacy or mobile-authored one seeded into a form. Such a
 * title is never truncated on load, so the counter has to be able to say it is over.
 */
export const isEventTitleOverLimit = (value: string): boolean => eventTitleLength(value) > EVENT_TITLE_LIMIT

/**
 * The most of `value` that may be kept. This is what a title field's `onChange` stores.
 *
 * Whitespace passes through free INCLUDING trailing whitespace: a host who has spent the whole budget
 * and then presses space is between words, and swallowing that keystroke reads as a broken keyboard.
 * Nothing here trims — trimming belongs at save, not at keystroke.
 *
 * Over-long input is TRUNCATED rather than refused, keeping the longest prefix that fits, which is
 * what the native `maxLength` did. A paste that silently does nothing is the worse failure.
 *
 * When nothing is dropped the ORIGINAL string is returned, not a rebuilt copy. That keeps the common
 * path allocation-free, and it means a controlled input is never handed a different string than the
 * DOM already holds — which is what drops the buffer while an IME composition is open.
 */
export const clampEventTitle = (value: string): string => {
	if (!value) return ""
	const kept: string[] = []
	let used = 0
	let dropped = false
	for (const ch of value) {
		// `kept.length` is a code-point count, because each entry is one code point.
		if (kept.length >= EVENT_TITLE_RAW_LIMIT) {
			dropped = true
			break
		}
		if (isFreeChar(ch)) {
			kept.push(ch)
			continue
		}
		if (used >= EVENT_TITLE_LIMIT) {
			dropped = true
			break
		}
		kept.push(ch)
		used++
	}
	return dropped ? kept.join("") : value
}
