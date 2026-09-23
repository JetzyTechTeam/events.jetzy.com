/**
 * Per-ticket capacity — the PURE half.
 *
 * Deliberately free of mongoose and of any `@/models` import: the public event page reads
 * these to cap its stepper and render a sold-out state, and webpack follows imports (including
 * dynamic ones) into the client bundle. The same split, for the same reason, as
 * `invite-trial.ts` vs `signup-trial.ts`. Everything that has to ask the database lives in
 * `src/lib/ticket-availability.ts`.
 *
 * The field is tri-state, like `requireApproval` and `membershipInterval`:
 *
 *   | Stored      | Meaning            |
 *   |-------------|--------------------|
 *   | `undefined` | unlimited          |
 *   | `0`         | none available     |
 *   | `n > 0`     | n exist, in total  |
 *
 * `undefined` is unlimited and NOT zero — every ticket written before this field existed has
 * no value, and reading those as sold out would take every live event offline.
 */

/**
 * Below this many left, the ticket card says so. A count, not a ratio — "2 left" is urgent
 * whether the ticket started at 10 or at 1000.
 */
export const LOW_STOCK_THRESHOLD = 5

/** Anything with a `quantity`, so a raw form value can be resolved the same way a stored ticket is. */
type QuantityLike = { quantity?: number | string | null } | null | undefined

/**
 * The ticket's own limit, or `null` for unlimited.
 *
 * A non-integer, negative or unparseable value reads as unlimited rather than as a limit we
 * invented — refusing a sale on a number nobody typed is the worse failure.
 */
export const ticketQuantityLimit = (ticket: QuantityLike): number | null => {
	const raw = ticket?.quantity
	if (raw === undefined || raw === null || raw === "") return null
	const value = Math.floor(Number(raw))
	if (!Number.isFinite(value) || value < 0) return null
	return value
}

/** How many are left, or `null` when the ticket is unlimited. Never negative. */
export const remainingForTicket = (limit: number | null, sold: number): number | null => {
	if (limit === null) return null
	return Math.max(0, limit - (Number(sold) || 0))
}

/** True when this ticket cannot be bought at all right now. */
export const isSoldOut = (limit: number | null, sold: number): boolean => remainingForTicket(limit, sold) === 0

/**
 * What to tell a buyer when the stepper stops. Mirrors `premiumOrderCapMessage` — say WHY the
 * button is dead rather than leaving it dead.
 */
export const remainingMessage = (remaining: number, ticketName?: string): string => {
	const what = ticketName ? `"${ticketName}"` : "this ticket"
	if (remaining <= 0) return `${ticketName ? `${ticketName} is` : "This ticket is"} sold out.`
	return `Only ${remaining} ${remaining === 1 ? "ticket" : "tickets"} left for ${what}.`
}

/** The refusal a buyer sees when their order is larger than what is left. */
export const notEnoughLeftMessage = (remaining: number, ticketName?: string): string => {
	const what = ticketName ? `"${ticketName}"` : "this event"
	if (remaining <= 0) return `${what} is sold out.`
	return `Only ${remaining} ${remaining === 1 ? "spot is" : "spots are"} left for ${what}.`
}
