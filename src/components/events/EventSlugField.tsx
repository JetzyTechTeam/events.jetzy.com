import React from "react"
import { Box, Flex, FormLabel, Input, Spinner, Text } from "@chakra-ui/react"
import axios from "axios"
import { MAX_SLUG_LENGTH, eventPath, slugifyFromName, validateEventSlug } from "@/lib/event-slug"

type Props = {
	value: string
	onChange: (value: string) => void
	/** Used to preview the auto-derived URL while the field is blank. */
	eventName?: string
	/** Present when editing — excludes this event from the availability check. */
	eventId?: string
	/** Show the "the old URL will redirect here" notice (Manage page only). */
	warnOnChange?: boolean
	/** The slug currently saved, so the warning only appears once it actually differs. */
	originalSlug?: string
}

const DISPLAY_HOST = (process.env.NEXT_PUBLIC_URL || "https://events.jetzy.com")
	.replace(/^https?:\/\//, "")
	.replace(/\/$/, "")

/**
 * "Event URL" input, shared by the create and manage forms so both validate identically.
 *
 * Validation mirrors the API exactly by calling the same `validateEventSlug`; the
 * availability check is debounced against `/api/events/slug-available`.
 */
export default function EventSlugField({ value, onChange, eventName, eventId, warnOnChange, originalSlug }: Props) {
	const [availability, setAvailability] = React.useState<
		{ state: "idle" | "checking" } | { state: "taken" | "free"; reason?: string }
	>({ state: "idle" })

	const trimmed = (value || "").trim()
	const localCheck = trimmed ? validateEventSlug(trimmed) : null
	const localError = localCheck && !localCheck.ok ? localCheck.reason : null

	// Debounced availability lookup. Skipped while the value fails local validation,
	// and skipped when it matches the slug already saved for this event.
	React.useEffect(() => {
		if (!trimmed || localError || trimmed === originalSlug) {
			setAvailability({ state: "idle" })
			return
		}
		setAvailability({ state: "checking" })
		const t = setTimeout(async () => {
			try {
				const params = new URLSearchParams({ slug: trimmed })
				if (eventId) params.set("eventId", eventId)
				const res = await axios.get(`/api/events/slug-available?${params.toString()}`)
				const data = res.data?.data
				setAvailability(data?.available ? { state: "free" } : { state: "taken", reason: data?.reason })
			} catch {
				// A failed check shouldn't block typing — the API re-validates on save.
				setAvailability({ state: "idle" })
			}
		}, 450)
		return () => clearTimeout(t)
	}, [trimmed, localError, eventId, originalSlug])

	const previewSlug = trimmed || slugifyFromName(eventName) || ""
	const changed = !!originalSlug && !!trimmed && trimmed !== originalSlug

	return (
		<Box>
			<FormLabel mb={1} color="white" fontSize="16px" fontWeight={500}>Event URL</FormLabel>

			<Flex align="center" bg="#090C10" border="1px solid #343536" borderRadius="md" overflow="hidden" h="48px">
				<Text px={3} color="#868686" fontSize="14px" whiteSpace="nowrap" flexShrink={0}>
					{DISPLAY_HOST}/
				</Text>
				<Input
					value={value || ""}
					onChange={(e) => onChange(e.target.value)}
					placeholder={eventName ? slugifyFromName(eventName) || "your-event" : "your-event"}
					maxLength={MAX_SLUG_LENGTH}
					bg="transparent"
					border="none"
					color="white"
					pl={0}
					_focusVisible={{ boxShadow: "none" }}
				/>
				{availability.state === "checking" && <Spinner size="sm" color="#868686" mr={3} />}
			</Flex>

			{localError ? (
				<Text fontSize="12px" color="red.300" mt={1}>{localError}</Text>
			) : availability.state === "taken" ? (
				<Text fontSize="12px" color="red.300" mt={1}>{availability.reason || "That event URL is already taken."}</Text>
			) : availability.state === "free" ? (
				<Text fontSize="12px" color="green.300" mt={1}>That URL is available.</Text>
			) : (
				<Text fontSize="12px" color="#868686" mt={1} lineHeight="140%">
					{trimmed
						? `Your event will live at ${DISPLAY_HOST}${eventPath(trimmed)}`
						: previewSlug
							? `Leave blank and we'll use ${DISPLAY_HOST}${eventPath(previewSlug)}`
							: "Leave blank and we'll generate one for you."}
				</Text>
			)}

			{/* Spaces and punctuation are allowed; only characters that can't survive a URL
			    path are rejected. Say so, so hosts don't assume it must be a-z only. */}
			<Text fontSize="12px" color="#5F6368" mt={1} lineHeight="140%">
				Spaces, accents and most punctuation are fine. Slashes, question marks, hashes and percent signs aren&apos;t.
			</Text>

			{warnOnChange && changed && (
				<Box mt={2} p={2} borderRadius="6px" bg="rgba(247,148,50,0.12)" border="1px solid rgba(247,148,50,0.4)">
					<Text fontSize="12px" color="#F79432" fontWeight={700}>The old URL will redirect here</Text>
					<Text fontSize="12px" color="#D6D6D6" mt={1} lineHeight="140%">
						Links you&apos;ve already shared, printed QR codes and links in emails already sent will keep working —
						they&apos;ll send people to the new URL automatically. The old address stays reserved, so no other
						event can take it.
					</Text>
				</Box>
			)}
		</Box>
	)
}
