import React, { useMemo } from "react"
import { useRouter } from "next/router"
import Link from "next/link"
import { Box, Flex, Image, Stack, Text, useColorModeValue } from "@chakra-ui/react"
import { useSession } from "next-auth/react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

import { eventPath } from "@/lib/event-slug"
import { eventMedia } from "@/lib/event-media"
import { EventStatus, STATUS_LABEL, getEventStatus } from "@/utils/eventSort"
import { getEventZone } from "@/utils/eventTime"
import { stripHtml } from "@/utils/text"
import { DateTimeSVG, LocationSVG } from "@/assets/icons"
import PremiumEventBadge from "@/components/events/PremiumEventBadge"

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * The event card, shared by the public listing and the console dashboard.
 *
 * Extracted so the two can't drift: the dashboard used to be a separate Tailwind card with
 * its own image treatment, stats layout and Edit button, and every change had to be made
 * twice (and usually wasn't). Admins see both surfaces, so they saw two different cards for
 * the same event.
 *
 * Only what the card needs — both `IEvent` and the redux `EventInterface` satisfy it.
 */
export interface EventCardItem {
	_id: any
	name?: string
	slug?: string
	images?: string[]
	videos?: string[]
	mediaOrder?: string[]
	location?: string
	locationDisclosedAfterBooking?: boolean
	startsOn?: any
	endsOn?: any
	timezone?: string
	hasStartTime?: boolean
	datePoll?: { isActive?: boolean }
	benefits?: string
	privacy?: string
	premiumEvent?: boolean
	ownerId?: any
	createdAt?: any
}

const STATUS_BADGE: Record<EventStatus, { bg: string; color: string; border?: string }> = {
	live: { bg: "#123B2A", color: "#39D98A", border: "#39D98A" },
	future: { bg: "#F79432", color: "black" },
	tbd: { bg: "#2A2A2A", color: "#A7A7A7", border: "#444444" },
	past: { bg: "#444444", color: "#A7A7A7" },
}

/**
 * `previewAsGuest` suppresses the viewer's own privileges so the card renders as a visitor
 * sees it — no Manage button, no ticket counts, no PRIVATE badge. Used by the host-facing
 * "In the events list" preview on the manage page, which shows the real card rather than a
 * mock-up of one so the two cannot drift apart.
 */
export default function EventListingCard({ event, onClick, previewAsGuest = false }: { event: EventCardItem; onClick?: (event: EventCardItem) => void; previewAsGuest?: boolean }) {
	const router = useRouter()
	const { data: session } = useSession()

	const role = (session?.user as any)?.role
	const userName = (session?.user as any)?.name || (session?.user as any)?.fullName
	const hasAdminRole = role === "admin" || role === "super admin" || userName?.toLowerCase() === "super admin"

	// Owners manage their own events straight from the list, not just admins.
	// Events created before `ownerId` existed have none, so their host sees no button.
	const userId = (session?.user as any)?._id?.toString()
	const ownsEvent = !!userId && event.ownerId?.toString() === userId

	const isAdmin = hasAdminRole && !previewAsGuest
	const isOwner = ownsEvent && !previewAsGuest
	const canManage = isAdmin || isOwner

	// Only admins are shown these numbers, so only admins should pay for the request.
	// The preview never fetches: `_id` may be absent while the host is still typing, and a
	// count no guest will see is not worth a round trip.
	const { data: totals } = useQuery({
		queryKey: ["eventTotals", event._id],
		queryFn: () => axios.get(`/api/events/${event._id}/totals`).then((r) => r.data),
		enabled: isAdmin && !!event._id,
	})
	const totalTickets = totals?.totalTickets ?? 0
	const uniqueGuests = totals?.uniqueGuests ?? 0

	const cardBg = useColorModeValue("#1e1e1e", "gray.700")
	const borderColor = useColorModeValue("#434343", "gray.600")

	// The banner's own first item, so a host who dragged a video to the front sees the video
	// here too. Reading `images[0]` showed a stale photo — or nothing at all on a video-only
	// event.
	const lead = eventMedia(event as any)[0]

	const timeStatus: EventStatus = getEventStatus(event as any)
	const badge = STATUS_BADGE[timeStatus]
	const isPrivate = event.privacy === "private"

	const { formattedDate, formattedTime } = useMemo(() => {
		if (!event?.startsOn) return { formattedDate: "", formattedTime: "" }
		const date = dayjs.utc(event.startsOn).tz(getEventZone(event.timezone as string))
		return {
			formattedDate: date.format("MMMM DD, YYYY"),
			formattedTime: event?.hasStartTime !== false ? date.format("hh:mm A") : "",
		}
	}, [event?.startsOn, event?.timezone, event?.hasStartTime])

	const open = () => {
		// A preview is a picture of the card, not a link. Clicking it would drop the host out
		// of a form holding unsaved edits.
		if (previewAsGuest) return
		if (onClick) {
			onClick(event)
			return
		}
		router.push(eventPath(event.slug as string))
	}

	return (
		<Box
			borderWidth="1px"
			borderColor={borderColor}
			borderRadius="lg"
			overflow="hidden"
			bg={cardBg}
			boxShadow="lg"
			// Fixed so every card in a row ends at the same line. Sized for the tallest
			// variant — an admin, whose card also carries the ticket counts.
			h="500px"
			display="flex"
			flexDirection="column"
			cursor={previewAsGuest ? "default" : "pointer"}
			_hover={previewAsGuest ? undefined : { transform: "scale(1.03)", transition: "transform 0.2s ease-in-out" }}
			onClick={open}
		>
			<Box p="2" position="relative" flexShrink={0}>
				{/* Status badge (live / upcoming / tbd / ended) */}
				<Flex position="absolute" top="4" right="4" zIndex="3" gap="1.5" align="center">
					{isAdmin && isPrivate && (
						<Box bg="#7C1D1D" border="1px solid" borderColor="red.400" px="2" py="0.5" rounded="md" fontSize="xs" fontWeight="bold" color="white">
							PRIVATE
						</Box>
					)}
					<Box
						bg={badge.bg}
						color={badge.color}
						border={badge.border ? "1px solid" : undefined}
						borderColor={badge.border}
						px="2"
						py="0.5"
						rounded="md"
						fontSize="xs"
						fontWeight="bold"
						letterSpacing="0.03em"
					>
						{STATUS_LABEL[timeStatus]}
					</Box>
				</Flex>

				{/* Banners arrive at whatever aspect the host uploaded, so letterbox on black and
				    show the whole image — same treatment as the event detail page hero. */}
				{lead ? (
					<Box position="relative" w="100%" h="200px" rounded="lg" overflow="hidden" bg="black">
						{/* Premium ribbon — top-LEFT corner of the artwork, the one free corner:
						    status/PRIVATE own the top-right and the benefits chips own the bottom.
						    Not admin-gated; every visitor sees it. */}
						{event.premiumEvent && <PremiumEventBadge variant="ribbon" />}
						{lead.type === "video" ? (
							<>
								{/* First frame only — `#t=0.1` is the media-fragment poster trick used
								    across the album views. A listing page carries a dozen cards, so
								    nothing autoplays here. */}
								<Box
									as="video"
									src={`${lead.url}#t=0.1`}
									muted
									playsInline
									preload="metadata"
									position="absolute"
									inset={0}
									w="100%"
									h="100%"
									sx={{ objectFit: "contain" }}
								/>
								<Flex position="absolute" bottom="2" right="2" align="center" justify="center" w="28px" h="28px" rounded="full" bg="blackAlpha.700" zIndex="2">
									<Text fontSize="xs" color="white">▶</Text>
								</Flex>
							</>
						) : (
							<Image
								src={lead.url}
								alt={stripHtml(event.name || "")}
								position="absolute"
								inset={0}
								objectFit="contain"
								w="100%"
								h="100%"
							/>
						)}
					</Box>
				) : (
					<Box position="relative" overflow="hidden" w="100%" h="200px" rounded="lg" bg="#2A2D35" display="flex" alignItems="center" justifyContent="center" flexDirection="column" gap="2">
						{event.premiumEvent && <PremiumEventBadge variant="ribbon" />}
						<Text fontSize="3xl">🖼️</Text>
						<Text fontSize="sm" color="gray.500">No image</Text>
					</Box>
				)}

				{/* Benefits overlay — bottom-left, over a scrim so it reads on any photo. Horizontal
				    chips instead of a stacked column, which crowded the status badges above. */}
				{event.benefits && event.benefits.trim() !== "" && (
					<>
						<Box position="absolute" left="0" right="0" bottom="0" h="16" bgGradient="linear(to-t, blackAlpha.700, transparent)" zIndex="1" pointerEvents="none" />
						<Flex position="absolute" bottom="2" left="2" right="2" gap="1.5" flexWrap="wrap" zIndex="2">
							{event.benefits
								.split(",")
								.map((b) => b.trim())
								.filter((b) => b !== "")
								.slice(0, 3)
								.map((benefit, index) => (
									<Box
										key={index}
										bg="blackAlpha.700"
										backdropFilter="blur(4px)"
										px="2.5"
										py="1"
										rounded="full"
										color="white"
										fontSize="xs"
										fontWeight="semibold"
										border="1px solid"
										borderColor="whiteAlpha.400"
										noOfLines={1}
									>
										{benefit}
									</Box>
								))}
						</Flex>
					</>
				)}
			</Box>

			<Box p="2" display="flex" flexDirection="column" flex="1" minH={0}>
				<Stack spacing="3">
					<Text fontSize="xl" fontWeight="bold" noOfLines={2} minH="3.5rem">
						{stripHtml(event.name || "")}
					</Text>
					<Box h="24" overflow="hidden">
						<Text fontSize="sm" color="gray.500" suppressHydrationWarning display="flex" gap="2">
							<DateTimeSVG />
							{!event?.startsOn && !event?.endsOn && event?.datePoll?.isActive
								? "Date to be decided (Polling)"
								: event?.startsOn
								? `${formattedDate}${formattedTime ? ` ${formattedTime}` : ""}`
								: "Date to be decided"}
						</Text>
						<Text fontSize="sm" color="gray.500" suppressHydrationWarning display="flex" gap="2" mt="2">
							{event.locationDisclosedAfterBooking ? (
								"📍 Location will be disclosed after registration"
							) : (
								<>
									<span><LocationSVG /></span>
									<Text as="span" noOfLines={2}>{event.location}</Text>
								</>
							)}
						</Text>
					</Box>
					{/* Admin-only, and on one line: two stacked lines pushed the buttons off the
					    bottom of the card. */}
					{isAdmin && (
						<Flex fontSize="sm" color="gray.400" gap="4">
							<Text>👥 {uniqueGuests}</Text>
							<Text>🎟️ {totalTickets}</Text>
						</Flex>
					)}
				</Stack>

				{/* Footer, outside the Stack so `mt="auto"` can pin it — Chakra's Stack owns the
				    top margin of its own children. With a manage button the two share the row as
				    equals; alone, RSVP is centred. A 1fr/auto/1fr grid looked broken here, since
				    "Manage Event" is far wider than "RSVP" and pushed it off centre. */}
				<Flex mt="auto" pt="2" gap="2" align="center" justify={canManage ? "stretch" : "center"}>
					<Box
						flex={canManage ? "1" : undefined}
						bg="#F79432"
						color="black"
						px="4"
						py="1.5"
						rounded="lg"
						textAlign="center"
					>
						<Text className="uppercase text-xs font-bold">rsvp</Text>
					</Box>
					{canManage && (
						<Box flex="1" minW={0}>
							<Link href={`/console/events/${event._id}/manage`} onClick={(e) => e.stopPropagation()} style={{ display: "block" }}>
								<Box
									bg="#3E3E3E"
									_hover={{ bg: "#4E4E4E" }}
									px="3"
									py="1.5"
									rounded="lg"
									fontSize="xs"
									fontWeight="semibold"
									color="white"
									border="1px"
									borderColor="whiteAlpha.300"
									textAlign="center"
									whiteSpace="nowrap"
								>
									Manage Event
								</Box>
							</Link>
						</Box>
					)}
				</Flex>
			</Box>
		</Box>
	)
}
