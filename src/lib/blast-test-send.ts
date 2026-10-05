/**
 * The address a blast test send goes to.
 *
 * PURE AND CLIENT-SAFE — the preview modal shows the refusal as the host types, and the API route
 * runs the identical check authoritatively, so the field and the server cannot disagree. Same
 * split as `blast-attachments.ts`.
 *
 * A test used to be locked to the session's own address. That was too tight in practice: the
 * person operating the console is often not the person who has to approve the email, and
 * forwarding it by hand changes the headers and the rendering, which defeats the point of a test.
 * The address is now typed, so it has to be checked properly.
 */

import { z } from "zod"

/** Matches the house pattern — `api/premium/send-code.ts` validates the same way. */
const emailSchema = z.string().email()

export type TestAddressResult = { email: string; error?: undefined } | { email?: undefined; error: string }

/**
 * Trims, checks and lowercases a typed test address.
 *
 * Rejections, and why each one is a rejection rather than a silent repair:
 *
 *  - **Control characters** (`\r`, `\n`, `\t`, `\0`) are the header-injection shape. We refuse
 *    rather than strip, because an address that arrived mangled is an address the host should look
 *    at — quietly sending to a different string than they typed is worse than telling them.
 *  - **Inner whitespace** means a broken paste (`a b@x.com`), not an address.
 *  - **A comma or semicolon** means they tried to enter several. Saying "one address" is more use
 *    than silently mailing the first and letting them believe both were tested.
 */
export function normalizeTestAddress(raw: string | undefined | null): TestAddressResult {
	// Trim first: a copy-pasted address routinely carries surrounding whitespace, and that is the
	// one piece of mess worth fixing for the host rather than complaining about.
	const trimmed = (raw || "").trim()

	if (!trimmed) {
		return { error: "Enter an address to send the test to." }
	}

	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
		return { error: "That address contains a line break or control character. Paste it again as plain text." }
	}

	if (/[,;]/.test(trimmed)) {
		return { error: "One address at a time for a test send." }
	}

	if (/\s/.test(trimmed)) {
		return { error: "That address has a space in it." }
	}

	if (!emailSchema.safeParse(trimmed).success) {
		return { error: "That doesn't look like an email address." }
	}

	// Lowercased for sending. Local-parts are technically case-sensitive, but every provider we
	// mail folds them, and this codebase has been bitten repeatedly by addresses stored in mixed
	// case (`Bookings.customerEmail` has no `lowercase: true`).
	return { email: trimmed.toLowerCase() }
}

/**
 * How many test sends one account may fire, and over what window.
 *
 * The equality check against the session email used to be the only thing standing between this
 * route and an open, Jetzy-branded mail cannon. What replaces it: a session is still required, the
 * caller must still be an admin or the event's owner — a stranger cannot reach the route at all,
 * which is the difference between this and the unauthenticated `premium/send-code` — and this
 * ceiling. Enough to iterate on copy, far short of a mailing tool.
 */
export const BLAST_TEST_MAX_PER_WINDOW = 10
export const BLAST_TEST_WINDOW_MS = 10 * 60 * 1000
export const BLAST_TEST_RATE_LIMIT_MESSAGE = `That's ${BLAST_TEST_MAX_PER_WINDOW} test sends in a few minutes. Give it a moment before sending another.`
