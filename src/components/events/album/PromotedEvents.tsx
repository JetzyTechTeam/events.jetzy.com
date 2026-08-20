import React from "react"
import Link from "next/link"
import { Box, Flex, Text } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

import { eventPath } from "@/lib/event-slug"
import { getEventStatus } from "@/utils/eventSort"
import { getEventZone } from "@/utils/eventTime"
import { stripHtml } from "@/utils/text"
import { DateTimeSVG, LocationSVG } from "@/assets/icons"
import type { IEvent } from "@/models/events/types"

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Events promoted alongside album photos.
 *
 * An album is a dead end otherwise: someone arrives from a share link, looks at photos of an
 * event that already happened and leaves. This puts the next event in front of them while
 * they browse — in the left column on desktop, interleaved between photos on mobile.
 *
 * Deliberately its own small card rather than a widened `EventCard`: that one is local to
 * EventsListing, is fixed at 480px tall and fires a totals query per card. Same reasoning as
 * BookingCard.
 */

/** Desktop rail length. Enough to be worth a look, short enough to stay in one viewport. */
export const PROMOTED_EVENTS_LIMIT = 4

/**
 * Live + upcoming public events, minus the one this album belongs to.
 *
 * `/api/events` already excludes drafts, private events and anything pending admin approval
 * for non-admins, so it is safe on a page anonymous visitors reach. Its LIMIT is hardcoded at
 * 20 with no `limit` param, so the slice happens here. `search` is never passed — that path
 * makes an outbound call to the Jetzy interests API.
 */
export function usePromotedEvents(excludeEventId?: string) {
	const { data } = useQuery({
		queryKey: ["promoted-events"],
		queryFn: async () => {
			const res = await axios.get("/api/events?page=1")
			return (res.data?.data ?? []) as IEvent[]
		},
		// The same list serves every album; no need to refetch as someone scrolls photos.
		staleTime: 5 * 60 * 1000,
	})

	return React.useMemo(() => {
		const all = Array.isArray(data) ? data : []
		return all.filter((e) => {
			if (!e?.slug && !e?._id) return false
			if (excludeEventId && e._id?.toString() === excludeEventId) return false
			// Promoting a finished event to someone browsing photos wastes the slot.
			const status = getEventStatus(e as any)
			return status === "live" || status === "future"
		})
	}, [data, excludeEventId])
}

/** Compact row: thumb + name + when + where. Opens in a new tab so the album isn't lost. */
export function PromotedEventCard({ event }: { event: IEvent }) {
	const when = React.useMemo(() => {
		if (!event?.startsOn) return event?.datePoll?.isActive ? "Date to be decided (Polling)" : "Date to be decided"
		const date = dayjs.utc(event.startsOn).tz(getEventZone(event.timezone))
		const day = date.format("MMM DD, YYYY")
		return event?.hasStartTime !== false ? `${day} ${date.format("hh:mm A")}` : day
	}, [event?.startsOn, event?.timezone, event?.hasStartTime, event?.datePoll?.isActive])

	return (
		<Link href={eventPath(event.slug)} target="_blank" rel="noreferrer" style={{ display: "block" }}>
			<Flex
				gap={3}
				p={2}
				borderRadius="12px"
				border="1px solid #2a2a2a"
				bg="#1a1a1a"
				align="center"
				transition="border-color .15s ease, background .15s ease"
				_hover={{ borderColor: "#3f3f3f", bg: "#202020" }}
			>
				{/* Letterboxed like every other card in the app — banners have no fixed aspect. */}
				<Box position="relative" w="72px" h="72px" flexShrink={0} borderRadius="8px" overflow="hidden" bg="black">
					{event.images?.[0] ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={event.images[0]}
							alt={stripHtml(event.name || "")}
							loading="lazy"
							decoding="async"
							style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
						/>
					) : (
						<Flex align="center" justify="center" w="100%" h="100%" fontSize="xl">
							🖼️
						</Flex>
					)}
				</Box>

				<Box minW={0} flex="1">
					<Text fontSize="sm" fontWeight="bold" color="white" noOfLines={2}>
						{stripHtml(event.name || "")}
					</Text>
					<Flex align="center" gap={1.5} mt={1} color="#8a8a8a" fontSize="xs">
						<DateTimeSVG />
						<Text noOfLines={1}>{when}</Text>
					</Flex>
					{!event.locationDisclosedAfterBooking && event.location && (
						<Flex align="center" gap={1.5} mt={0.5} color="#8a8a8a" fontSize="xs">
							<span>
								<LocationSVG />
							</span>
							<Text noOfLines={1}>{event.location}</Text>
						</Flex>
					)}
				</Box>
			</Flex>
		</Link>
	)
}

/** Desktop rail. Renders nothing when there is nothing to promote — no empty state. */
export function PromotedEventsRail({ events }: { events: IEvent[] }) {
	if (events.length === 0) return null

	return (
		<Box mt={8}>
			<Text fontSize="xs" fontWeight="bold" color="#8a8a8a" letterSpacing="0.08em" mb={3}>
				UPCOMING ON JETZY
			</Text>
			<Flex direction="column" gap={3}>
				{events.slice(0, PROMOTED_EVENTS_LIMIT).map((e) => (
					<PromotedEventCard key={e._id?.toString()} event={e} />
				))}
			</Flex>
		</Box>
	)
}
