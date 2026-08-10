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

export type IssueLike = { path?: unknown; message?: string }

/**
 * `{ path: ["tickets", 0, "price"], message: "Price can't be negative." }`
 *   -> "Ticket 1: Price can't be negative."
 *
 * Falls back to the bare message when the path has no array index — a top-level field like
 * `capacity` is already named by its own message and a "Capacity 1:" prefix would be noise.
 */
export const describeIssue = (issue: IssueLike): string => {
	const message = (issue?.message || "").trim() || "This value isn't valid."
	const path = Array.isArray(issue?.path) ? (issue.path as unknown[]) : []

	// First numeric segment is the index into a repeated field; the segment before it names
	// the collection. Anything deeper is the leaf field, which the message already covers.
	const indexAt = path.findIndex((segment) => typeof segment === "number")
	if (indexAt < 1) return message

	const collection = String(path[indexAt - 1] ?? "")
	const label = COLLECTION_LABELS[collection]
	if (!label) return message

	return `${label} ${Number(path[indexAt]) + 1}: ${message}`
}
