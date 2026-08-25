import React from "react"
import { Box, Flex, Heading, Text } from "@chakra-ui/react"
import { useFormikContext } from "formik"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import customParseFormat from "dayjs/plugin/customParseFormat"

import EventListingCard, { EventCardItem } from "@/components/events/EventListingCard"
import { getEventZone } from "@/utils/eventTime"
import { CreateEventFormData } from "@/types"
import { FileUploadData } from "@/components/misc/DragAndDropUploader"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

/**
 * "In the events list" — the host's own card, rendered live from the form.
 *
 * Banners have no enforced upload aspect ratio and the card letterboxes on black
 * (`objectFit: contain`), so what a portrait poster looks like in a listing is genuinely
 * not guessable from the upload box. Same reason the detail-page preview exists: the host
 * is the one person who never sees their event the way a visitor does.
 *
 * Renders the REAL `EventListingCard` with `previewAsGuest`, not a copy of it — a
 * hand-rolled lookalike is exactly the drift the card was extracted to stop (see the note
 * at the top of EventListingCard).
 *
 * Lives inside <Formik>; reads values from context so the parent page doesn't re-render
 * on every keystroke. Same pattern as AutosaveManager.
 */
export default function ListingCardPreview({
	images,
	videos,
	mediaOrder,
	eventId,
}: {
	images: FileUploadData[]
	videos: FileUploadData[]
	mediaOrder: string[]
	/** Absent while creating — the card needs no id, and the preview never fetches totals. */
	eventId?: string
}) {
	const { values } = useFormikContext<CreateEventFormData>()

	const item = React.useMemo<EventCardItem>(() => {
		// Mirrors api/events/create.ts exactly: time is optional and defaults to midnight,
		// and an active date poll replaces fixed dates altogether. A preview that dated the
		// event differently from the saved record would be worse than no preview.
		const zone = getEventZone(values.timezone)
		const pollActive = !!(values.datePoll?.isActive && (values.datePoll?.options?.length ?? 0) > 0)
		const startsOn =
			!pollActive && values.startDate
				? dayjs.tz(`${values.startDate} ${values.startTime || "00:00"}`, "YYYY-MM-DD HH:mm", zone).utc().toISOString()
				: undefined

		return {
			_id: eventId,
			name: values.name,
			slug: values.slug,
			images: images.map((i) => i.file).filter(Boolean),
			videos: videos.map((v) => v.file).filter(Boolean),
			mediaOrder,
			location: values.location,
			locationDisclosedAfterBooking: values.locationDisclosedAfterBooking,
			startsOn,
			timezone: values.timezone,
			hasStartTime: !!values.startTime,
			datePoll: { isActive: pollActive },
			benefits: values.benefits,
			privacy: values.privacy,
		} as EventCardItem
	}, [values, images, videos, mediaOrder, eventId])

	return (
		<Box bg="#15181C" border="1px solid #343536" borderRadius="10px" p={{ base: 4, md: 6 }}>
			<Heading size="md" color="white" mb={1}>In the events list</Heading>
			<Text color="#868686" fontSize="12px" lineHeight="140%" mb={4}>
				How your event appears to visitors browsing. Updates as you edit.
			</Text>
			{values.name?.trim() ? (
				<EventListingCard event={item} previewAsGuest />
			) : (
				<Flex h="180px" align="center" justify="center" border="1px dashed #343536" borderRadius="10px">
					<Text color="#868686" fontSize="14px">Name your event to see its card</Text>
				</Flex>
			)}
		</Box>
	)
}
