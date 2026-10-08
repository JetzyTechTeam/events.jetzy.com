import dayjs from "dayjs"
import { stripHtml } from "@/utils/text"

// One-line summaries for the collapsed form sections on a phone — what is set, at a glance.
// Shared by Manage Event and Create Event so the two pages describe the same value the same
// way. Pure formatting of form values; nothing here decides anything.
export const scheduleSummary = (values: any): string => {
	if (values?.datePoll?.isActive) {
		const n = (values.datePoll.options || []).length
		return `Date poll · ${n} option${n === 1 ? "" : "s"}`
	}
	if (!values?.startDate) return "No date set"
	const start = dayjs(`${values.startDate}T${values.startTime || "00:00"}`)
	if (!start.isValid()) return values.startDate
	return values.startTime ? start.format("ddd, MMM D · h:mm A") : start.format("ddd, MMM D")
}

export const textSummary = (value: string | undefined, empty: string): string => {
	const text = stripHtml(value || "").replace(/\s+/g, " ").trim()
	return text || empty
}

export const countSummary = (n: number, one: string, many: string = `${one}s`) => `${n} ${n === 1 ? one : many}`
