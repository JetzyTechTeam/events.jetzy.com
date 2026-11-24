/**
 * A list of email addresses TYPED by a person — "a@x.com, b@x.com; c@x.com".
 *
 * PURE AND CLIENT-SAFE. The blast composer's "To" field, the admin Email Attendees page and both
 * API routes behind them all read a typed list through `parseEmailList`, so what the field says it
 * will send to and what the server actually sends to cannot disagree.
 *
 * Separators: commas, semicolons, newlines and spaces — people paste lists out of spreadsheets,
 * Outlook (`;`) and Gmail (`,`) alike. Every token is then judged ON ITS OWN, which is also what
 * makes header injection impossible: `a@x.com\r\nBcc: z@y.com` splits into `a@x.com`, `Bcc:` (not
 * an address → reported) and `z@y.com` (a plain address, shown to the person typing it).
 *
 * Nothing is repaired silently: a token that isn't an address comes back in `invalid` so the field
 * can name it, rather than the list quietly shrinking.
 */

import { GUEST_EMAIL_PATTERN, guestEmailKey } from "@/lib/guest-import"

export type ParsedEmailList = {
	/** Valid addresses, lowercased, de-duplicated, in the order typed. */
	emails: string[]
	/** Tokens that are not addresses, as typed (de-duplicated). */
	invalid: string[]
}

/** Longest address SMTP allows. */
const EMAIL_MAX_LENGTH = 254

// Control characters other than the whitespace we split on. An address carrying one arrived
// mangled; it is reported, never cleaned up and sent.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

export const isTypedEmail = (token: string): boolean =>
	token.length <= EMAIL_MAX_LENGTH && !CONTROL_CHARS.test(token) && GUEST_EMAIL_PATTERN.test(token)

export function parseEmailList(raw: unknown): ParsedEmailList {
	// An array is accepted too — the API receives the parsed list back from the client, and
	// re-running it through here is the authoritative check.
	const text = Array.isArray(raw) ? raw.map((v) => String(v ?? "")).join(",") : String(raw ?? "")

	const emails: string[] = []
	const invalid: string[] = []
	const seen = new Set<string>()
	const seenInvalid = new Set<string>()

	for (const piece of text.split(/[\s,;]+/)) {
		// `<a@x.com>` and `"a@x.com"` come out of mail clients' copy-paste.
		const token = piece.trim().replace(/^[<"']+|[>"']+$/g, "")
		if (!token) continue

		if (!isTypedEmail(token)) {
			if (!seenInvalid.has(token)) {
				seenInvalid.add(token)
				invalid.push(token)
			}
			continue
		}

		const key = guestEmailKey(token)
		if (seen.has(key)) continue
		seen.add(key)
		emails.push(key)
	}

	return { emails, invalid }
}

/** "3 addresses" / "1 address". */
export const emailCountLabel = (n: number) => `${n} ${n === 1 ? "address" : "addresses"}`

/**
 * Extra addresses one event blast may carry. Hosts can use the field too, so this is what stops
 * a blast becoming a way to mail an arbitrary list from Jetzy's sending domain.
 */
export const BLAST_EXTRA_MAX = 50

/** Blasts carrying typed addresses that one HOST account may send per hour (admins exempt). */
export const BLAST_EXTRA_SENDS_PER_HOUR = 10

/** Recipients one admin attendee mailing may carry. */
export const ATTENDEE_MAIL_MAX = 2000
