import type { ZodIssue } from "zod"

// Turns zod issues into one sentence surfaced in a toast — a bare "Invalid data"
// tells the host nothing when the field that failed is off-screen or unlabeled.
export function zodIssuesToMessage(issues: ZodIssue[]): string {
	if (!issues.length) return "Invalid data"
	return issues
		.map((issue) => {
			const field = issue.path.join(".")
			return field ? `${field}: ${issue.message}` : issue.message
		})
		.join("; ")
}
