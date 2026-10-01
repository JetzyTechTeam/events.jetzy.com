import type { ZodIssue } from "zod"
import { describeIssue } from "@/lib/form-errors"

/**
 * Turn zod issues into one sentence for the top-level `message` of an error response.
 *
 * A bare "Invalid data" tells the host nothing when the field that failed is off-screen or
 * unlabeled. This shares `describeIssue` with the client toaster deliberately: the inline
 * editor and Manage Event read different parts of the same response, and they must not describe
 * the same failure in two different ways.
 */
export function zodIssuesToMessage(issues: ZodIssue[]): string {
	if (!issues.length) return "Invalid data"
	return issues.map((issue) => describeIssue(issue)).join("; ")
}
