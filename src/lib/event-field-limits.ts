/**
 * The length limits on an event's text fields — ONE number per field, read by the API routes
 * and by the form input alike.
 *
 * Why this module exists: `benefits` is stored as a single comma-separated string, and the
 * 23-character cap (the chips render over the banner artwork and longer ones wrap over it) was
 * written as `zod.string().max(23)` on the whole value. A host with two benefits could not save
 * their event at all. The same shape — one field, a different rule on each write path — was
 * waiting in six more fields: `details.ts` capped them, `create.ts` and `update.ts` did not, so
 * an edit made on one screen could be refused by the other.
 *
 * Pure and dependency-free, no mongoose and no React, so an API route and a Chakra component can
 * both import it. (Same split, same reason, as `invite-trial.ts` vs `signup-trial.ts` — webpack
 * follows a mongoose import into the client bundle.)
 */

/**
 * Characters as a person counts them: `[...s]` iterates code points, so an emoji is 1 rather
 * than the 2 UTF-16 units `.length` reports. `event-title.ts` and `checkout/index.ts` already
 * count this way; a limit that silently charges double for an emoji is not the limit it claims.
 */
export const countChars = (value: string): number => [...value].length

/**
 * Per BENEFIT chip, never for the joined string. The chips sit over the banner image.
 */
export const MAX_BENEFIT_LENGTH = 23

/**
 * How many benefits an event may carry. The chips sit on the banner, so a dozen of them bury the
 * artwork the host just uploaded — this is a layout limit, like the 23 above, not an arbitrary one.
 */
export const MAX_BENEFIT_COUNT = 6

/** The whole comma-separated value. A backstop against a paste, not the real rule. */
export const BENEFITS_RAW_LIMIT = 2000

export const EVENT_DESC_LIMIT = 20000
export const EVENT_LOCATION_LIMIT = 500
export const EVENT_VENUE_NAME_LIMIT = 300
export const EVENT_ENTRANCE_LIMIT = 200
export const EVENT_TIMEZONE_LIMIT = 100
export const DATE_POLL_QUESTION_LIMIT = 300
export const DATE_POLL_OPTION_LABEL_LIMIT = 200

/** Split a stored `benefits` value into the chips the host actually typed. */
export const benefitChips = (value: string): string[] =>
	(value || "")
		.split(",")
		.map((chip) => chip.trim())
		.filter(Boolean)

/**
 * The rule all three write paths share. Absent/empty is fine — the field is optional.
 */
export const benefitChipsWithinLimit = (value?: string): boolean =>
	!value || benefitChips(value).every((chip) => countChars(chip) <= MAX_BENEFIT_LENGTH)

/**
 * Kept separate from the length rule so the two report separately — "one of your benefits is too
 * long" and "you have too many benefits" are different problems with different fixes. Built on the
 * same `benefitChips`, so the two can never disagree about what counts as one benefit.
 */
export const benefitCountWithinLimit = (value?: string): boolean =>
	!value || benefitChips(value).length <= MAX_BENEFIT_COUNT

/**
 * The sentences the host reads in a toast. Written here, once, so the same mistake reads the
 * same whether it was made on Create, on Manage Event, or in the inline editor.
 */
export const EVENT_FIELD_MESSAGES = {
	benefitTooLong: `Each event benefit must be ${MAX_BENEFIT_LENGTH} characters or fewer.`,
	// The 2000 backstop, not the count rule — with the count capped at 6 this is unreachable
	// through the UI (6 x 23 + 5 commas = 143) and only a direct API call can trip it.
	benefitsTooLong: "Those event benefits are too long to store. Shorten them and try again.",
	tooManyBenefits: `You can have at most ${MAX_BENEFIT_COUNT} event benefits. Remove some and try again.`,
	descTooLong: `A description can be at most ${EVENT_DESC_LIMIT.toLocaleString()} characters.`,
	locationTooLong: `A location can be at most ${EVENT_LOCATION_LIMIT} characters.`,
	venueNameTooLong: `A venue name can be at most ${EVENT_VENUE_NAME_LIMIT} characters.`,
	entranceTooLong: `Arrival instructions can be at most ${EVENT_ENTRANCE_LIMIT} characters.`,
	timezoneTooLong: "That isn't a timezone we recognise.",
	capacityNotWhole: "Capacity must be a whole number.",
	capacityNegative: "Capacity can't be negative. Use 0 for unlimited.",
	pollQuestionTooLong: `A date poll question can be at most ${DATE_POLL_QUESTION_LIMIT} characters.`,
	pollOptionLabelTooLong: `A date option's label can be at most ${DATE_POLL_OPTION_LABEL_LIMIT} characters.`,
	pollOptionNeedsId: "A date option is missing its id. Remove it and add the date again.",
	pollOptionNeedsDate: "Every date option needs a date.",
} as const
