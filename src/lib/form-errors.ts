/**
 * Turn a server-side zod issue into something a host can act on.
 *
 * The API returns `data.error.errors` verbatim, and each issue carries a `path` —
 * `["tickets", 0, "price"]` — alongside its message. The toast used to render the message
 * alone, so a bad price on the third ticket read simply "Number must be greater than or
 * equal to 0", with nothing to say which field, or which ticket, was wrong.
 *
 * The message itself is the schema's job (give the validator a real sentence rather than
 * relying on zod's default). This adds the one thing the message can't know: WHICH item in
 * a repeated list it came from.
 *
 * Pure and dependency-free — safe to import from the toaster, which is client-side.
 */

/** Singular labels for the array fields a host actually edits. */
const COLLECTION_LABELS: Record<string, string> = {
	tickets: "Ticket",
	questions: "Question",
	images: "Image",
	videos: "Video",
	options: "Option",
}

/**
 * What a host calls each field, for the ones whose schema key is not what the screen says.
 *
 * The message is still the schema's job. This is the fallback for when the message cannot name
 * itself — zod's own defaults ("String must contain at most 23 character(s)") never do, and
 * that is precisely how a 23-character cap on `benefits` reached a host as a sentence with no
 * subject.
 */
const FIELD_LABELS: Record<string, string> = {
	name: "Event title",
	slug: "Event link",
	desc: "Description",
	benefits: "Event benefits",
	location: "Location",
	venueName: "Venue name",
	entrance: "Entrance",
	capacity: "Capacity",
	timezone: "Timezone",
	startDate: "Start date",
	startTime: "Start time",
	endDate: "End date",
	endTime: "End time",
	startsOn: "Start",
	endsOn: "End",
	datePoll: "Date poll",
	question: "Date poll question",
	privacy: "Privacy",
	status: "Status",
	interests: "Interests",
	mediaOrder: "Banner order",
	feedbackFormUrl: "Feedback form link",
	price: "Price",
	quantity: "Ticket quantity",
	// No `title`: it is a ticket's name here and the event's name elsewhere, and the row is
	// already labelled ("Ticket 1: Title: Give this ticket a name." reads worse than without).
}

export type IssueLike = { path?: unknown; message?: string }

/**
 * `{ path: ["tickets", 0, "price"], message: "Price can't be negative." }`
 *   -> "Ticket 1: Price can't be negative."
 *
 * `{ path: ["benefits"], message: "Each event benefit must be 23 characters or fewer." }`
 *   -> "Event benefits: Each event benefit must be 23 characters or fewer."
 *
 * A top-level field is prefixed only when we have a human label for it AND the message does not
 * already say the field's name — a message written for the host usually does, and "Capacity:
 * Capacity can't be negative" is worse than either half alone.
 */
export const describeIssue = (issue: IssueLike): string => {
	const message = (issue?.message || "").trim() || "This value isn't valid."
	const path = Array.isArray(issue?.path) ? (issue.path as unknown[]) : []

	// First numeric segment is the index into a repeated field; the segment before it names
	// the collection. Anything deeper is the leaf field, which the message already covers.
	const indexAt = path.findIndex((segment) => typeof segment === "number")
	if (indexAt >= 1) {
		const collection = String(path[indexAt - 1] ?? "")
		const label = COLLECTION_LABELS[collection]
		return label ? `${label} ${Number(path[indexAt]) + 1}: ${withField(message, path)}` : message
	}

	return withField(message, path)
}

/** Prefix the field's human name, unless the message already carries it. */
const withField = (message: string, path: unknown[]): string => {
	// The leaf is what failed; anything above it is the container, already named by the caller.
	const leaf = [...path].reverse().find((segment) => typeof segment === "string")
	const label = typeof leaf === "string" ? FIELD_LABELS[leaf] : undefined
	if (!label) return message
	if (message.toLowerCase().includes(label.toLowerCase())) return message
	return `${label}: ${message}`
}
