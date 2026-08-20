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
 * Deliberately its own card rather than a widened `EventCard`: that one is local to
 * EventsListing, is fixed at 480px tall and fires a totals query per card. Same reasoning as
 * BookingCard.
 */

/** Desktop rail length. Enough to be worth a look, short enough to stay in one viewport. */
export const PROMOTED_EVENTS_LIMIT = 3

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

/**
 * Stacked card: banner on top, then name, when and where.
 *
 * `size="lg"` is the mobile treatment — a card sitting between two photos competes with
 * full-bleed imagery, so a thumbnail-sized row reads as a footnote and gets scrolled past.
 */
export function PromotedEventCard({ event, size = "sm" }: { event: IEvent; size?: "sm" | "lg" }) {
	const when = React.useMemo(() => {
		if (!event?.startsOn) return event?.datePoll?.isActive ? "Date to be decided (Polling)" : "Date to be decided"
		const date = dayjs.utc(event.startsOn).tz(getEventZone(event.timezone))
		const day = date.format("MMM DD, YYYY")
		return event?.hasStartTime !== false ? `${day} ${date.format("hh:mm A")}` : day
	}, [event?.startsOn, event?.timezone, event?.hasStartTime, event?.datePoll?.isActive])

	const isLg = size === "lg"

	return (
		<Link href={eventPath(event.slug)} target="_blank" rel="noreferrer" style={{ display: "block" }}>
			<Box
				borderRadius="14px"
				border="1px solid #2a2a2a"
				bg="#1a1a1a"
				overflow="hidden"
				transition="border-color .15s ease, background .15s ease"
				_hover={{ borderColor: "#3f3f3f", bg: "#202020" }}
			>
				{/* Letterboxed like every other card in the app — banners have no fixed aspect. */}
				<Box position="relative" w="100%" h={isLg ? "200px" : "150px"} bg="black">
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
						<Flex align="center" justify="center" w="100%" h="100%" fontSize="3xl">
							🖼️
						</Flex>
					)}
				</Box>

				<Box p={isLg ? 4 : 3}>
					<Text fontSize={isLg ? "lg" : "md"} fontWeight="bold" color="white" noOfLines={2}>
						{stripHtml(event.name || "")}
					</Text>
					<Flex align="center" gap={2} mt={2} color="#9a9a9a" fontSize={isLg ? "sm" : "xs"}>
						<DateTimeSVG />
						<Text noOfLines={1}>{when}</Text>
					</Flex>
					{!event.locationDisclosedAfterBooking && event.location && (
						<Flex align="center" gap={2} mt={1} color="#9a9a9a" fontSize={isLg ? "sm" : "xs"}>
							<span>
								<LocationSVG />
							</span>
							<Text noOfLines={1}>{event.location}</Text>
						</Flex>
					)}
					<Flex mt={3}>
						<Box bg="#F79432" color="black" px={isLg ? 4 : 3} py={isLg ? 1.5 : 1} borderRadius="lg">
							<Text fontSize={isLg ? "sm" : "xs"} fontWeight="bold" textTransform="uppercase" letterSpacing="0.04em">
								RSVP
							</Text>
						</Box>
					</Flex>
				</Box>
			</Box>
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
