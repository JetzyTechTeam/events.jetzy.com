import React from "react"
import { Box, Text, Textarea } from "@chakra-ui/react"
import { emailCountLabel, parseEmailList } from "@/lib/email-list"

/**
 * "To" — a free-typed list of extra addresses, separated by commas.
 *
 * Used by the event blast composers and the admin Email Attendees page. The text is kept exactly
 * as typed (the parent owns it); what it MEANS comes from `parseEmailList`, the same function the
 * server runs, so the count under the field is the number the server will send to.
 */
export default function EmailListInput({
	value,
	onChange,
	label = "To (optional)",
	help = "Extra people to send this to — separate addresses with commas.",
	max,
	placeholder = "name@example.com, another@example.com",
}: {
	value: string
	onChange: (value: string) => void
	label?: string
	help?: string
	/** When set, more valid addresses than this is reported as an error. */
	max?: number
	placeholder?: string
}) {
	const { emails, invalid } = parseEmailList(value)
	const overMax = typeof max === "number" && emails.length > max

	return (
		<Box>
			<Text fontWeight="bold" mb={1}>
				{label}
			</Text>
			<Text fontSize="xs" color="gray.400" mb={2}>
				{help}
			</Text>
			<Textarea
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				rows={2}
				resize="vertical"
				bg="#090C10"
				borderColor={invalid.length > 0 || overMax ? "#FC8181" : "#444444"}
				color="white"
				_placeholder={{ color: "gray.500" }}
				autoComplete="off"
				autoCapitalize="none"
				autoCorrect="off"
				spellCheck={false}
				// iOS zooms into anything under 16px.
				sx={{ "@media screen and (max-width: 47.99em)": { fontSize: "16px" } }}
			/>
			{(emails.length > 0 || invalid.length > 0) && (
				<Text fontSize="xs" mt={1} color={invalid.length > 0 || overMax ? "#FC8181" : "gray.400"} overflowWrap="anywhere">
					{emails.length > 0 ? emailCountLabel(emails.length) : "No valid addresses"}
					{invalid.length > 0 ? ` · not valid: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? ` and ${invalid.length - 5} more` : ""}` : ""}
					{overMax ? ` · at most ${max} per send` : ""}
				</Text>
			)}
		</Box>
	)
}

/** True when the field holds something that would be refused — the parent disables Send on it. */
export const emailListHasProblem = (value: string, max?: number): boolean => {
	const { emails, invalid } = parseEmailList(value)
	return invalid.length > 0 || (typeof max === "number" && emails.length > max)
}
