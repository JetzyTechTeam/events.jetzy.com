/**
 * Importing a guest list (name + email) from a spreadsheet into the email invite.
 *
 * Pure and client-safe — the dialogs parse the file in the host's browser and `send-invites.ts`
 * re-checks the result with the same helpers, so the preview and the server can't disagree about
 * what is a valid row.
 *
 * NAME RULE: one full name. The template is `Name, Email`; a file with `First Name` + `Last Name`
 * columns instead is accepted and joined. `eventinvitations.name` is a single field, and the email
 * greets by the first word of it.
 */

export type ImportedGuest = { name: string; email: string }

export type GuestImportProblem = { row: number; value: string; reason: string }

export type GuestImportResult =
	| { ok: true; guests: ImportedGuest[]; problems: GuestImportProblem[] }
	| { ok: false; error: string }

/** One SendGrid call per recipient — keep an import to a size one request can send. */
export const GUEST_IMPORT_MAX = 500

export const GUEST_NAME_MAX = 100

/** The same check both invite dialogs already use for a typed address. */
export const GUEST_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isGuestEmail = (value: string) => GUEST_EMAIL_PATTERN.test(value.trim())

export const normalizeGuestName = (name: unknown): string =>
	String(name ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, GUEST_NAME_MAX)

export const normalizeGuestEmail = (email: unknown): string => String(email ?? "").trim()

/** Key for de-duplicating — addresses are not stored lowercased anywhere in this codebase. */
export const guestEmailKey = (email: string) => email.trim().toLowerCase()

/** First word of a full name, for "Hi Sarah,". Empty when there is no name. */
export const firstNameOf = (name: string): string => normalizeGuestName(name).split(" ")[0] || ""

const headerKey = (value: unknown) =>
	String(value ?? "")
		.toLowerCase()
		.replace(/[^a-z]/g, "")

const EMAIL_HEADERS = ["email", "emailaddress", "mail", "emailid"]
const NAME_HEADERS = ["name", "fullname", "guestname", "guest", "attendee", "attendeename"]
const FIRST_HEADERS = ["firstname", "first", "givenname", "forename"]
const LAST_HEADERS = ["lastname", "last", "surname", "familyname"]

type Columns = { email: number; name?: number; first?: number; last?: number; hasHeader: boolean }

const indexOfHeader = (keys: string[], wanted: string[]) => keys.findIndex((k) => wanted.includes(k))

/**
 * Work out which column is which. A header row is matched case/space/punctuation-insensitively
 * ("E-mail", "Full Name", "first_name"). A sheet with no header row — its first row already holds
 * an address — is read by content: the column with the address is the email, the first other
 * non-empty column the name.
 */
export function findColumns(rows: string[][]): Columns | null {
	const first = rows.find((r) => r.some((c) => String(c ?? "").trim()))
	if (!first) return null

	if (first.some((c) => isGuestEmail(String(c ?? "")))) {
		const email = first.findIndex((c) => isGuestEmail(String(c ?? "")))
		const name = first.findIndex((c, i) => i !== email && String(c ?? "").trim())
		return { email, name: name >= 0 ? name : undefined, hasHeader: false }
	}

	const keys = first.map(headerKey)
	const email = indexOfHeader(keys, EMAIL_HEADERS)
	if (email < 0) return null
	const name = indexOfHeader(keys, NAME_HEADERS)
	const firstName = indexOfHeader(keys, FIRST_HEADERS)
	const lastName = indexOfHeader(keys, LAST_HEADERS)
	return {
		email,
		name: name >= 0 ? name : undefined,
		first: firstName >= 0 ? firstName : undefined,
		last: lastName >= 0 ? lastName : undefined,
		hasHeader: true,
	}
}

const cell = (row: string[], index?: number) => (index === undefined ? "" : String(row[index] ?? ""))

/**
 * Rows of a sheet (as `sheet_to_json({ header: 1 })` returns them) → guests to invite plus the
 * rows that couldn't be used, each with a reason. Nothing is dropped without being reported except
 * a fully blank row.
 */
export function parseGuestRows(rows: string[][]): GuestImportResult {
	const columns = findColumns(rows)
	if (!columns) {
		return {
			ok: false,
			error: 'We couldn\'t find an email column. Put "Name" and "Email" in the first row, or download the template.',
		}
	}

	const guests: ImportedGuest[] = []
	const problems: GuestImportProblem[] = []
	const seen = new Set<string>()
	const firstDataRow = rows.findIndex((r) => r.some((c) => String(c ?? "").trim())) + (columns.hasHeader ? 1 : 0)

	for (let i = firstDataRow; i < rows.length; i++) {
		const row = rows[i] || []
		const rowNumber = i + 1 // as the host sees it in Excel
		if (!row.some((c) => String(c ?? "").trim())) continue

		const email = normalizeGuestEmail(cell(row, columns.email))
		const name =
			normalizeGuestName(cell(row, columns.name)) ||
			normalizeGuestName(`${cell(row, columns.first)} ${cell(row, columns.last)}`)

		if (!email) {
			problems.push({ row: rowNumber, value: name, reason: "No email address" })
			continue
		}
		if (!isGuestEmail(email)) {
			problems.push({ row: rowNumber, value: email, reason: "Not a valid email address" })
			continue
		}
		const key = guestEmailKey(email)
		if (seen.has(key)) {
			problems.push({ row: rowNumber, value: email, reason: "Already listed higher up in the file" })
			continue
		}
		if (guests.length >= GUEST_IMPORT_MAX) {
			problems.push({ row: rowNumber, value: email, reason: `Over the ${GUEST_IMPORT_MAX}-guest limit for one import` })
			continue
		}
		seen.add(key)
		guests.push({ name, email })
	}

	if (guests.length === 0 && problems.length === 0) {
		return { ok: false, error: "The file has no guests in it." }
	}
	return { ok: true, guests, problems }
}

/** Merge new guests into a list, skipping addresses already in it. Earlier entries win. */
export function mergeGuests(current: ImportedGuest[], incoming: ImportedGuest[]): ImportedGuest[] {
	const seen = new Set(current.map((g) => guestEmailKey(g.email)))
	const out = [...current]
	for (const g of incoming) {
		const key = guestEmailKey(g.email)
		if (seen.has(key)) continue
		seen.add(key)
		out.push(g)
	}
	return out
}

export const GUEST_IMPORT_TEMPLATE_CSV = "Name,Email\nSarah Khan,sarah@example.com\nJames Lee,james@example.com\n"
