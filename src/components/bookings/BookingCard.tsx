import React, { useMemo } from "react"
import { Box, Flex, Image, Stack, Text } from "@chakra-ui/react"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { getEventZone } from "@/utils/eventTime"
import { EventStatus, STATUS_LABEL } from "@/utils/eventSort"
import { DateTimeSVG, LocationSVG } from "@/assets/icons"
import { stripHtml } from "@/utils/text"
import PremiumBadge from "@/components/premium/PremiumBadge"
import { isCancelledBooking } from "@/lib/booking-status"
import { BookingStatus } from "@/models/events/types"

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * A guest's own booking, rendered in the same card shell as the public event listing so
 * "My Bookings" reads as the same product as the page they booked from.
 *
 * Deliberately a separate component rather than a prop-widened EventCard: EventCard lives
 * inside EventsListing, fetches per-event ticket totals and carries the admin Edit affordance.
 * Reusing it would drag booking concerns into the public listing. The visual spec is shared;
 * the data is not.
 */

const STATUS_BADGE: Record<string, { bg: string; color: string; border?: string; label: string }> = {
	[BookingStatus.CONFIRMED]: { bg: "#123B2A", color: "#39D98A", border: "#39D98A", label: "CONFIRMED" },
	[BookingStatus.APPROVED]: { bg: "#123B2A", color: "#39D98A", border: "#39D98A", label: "CONFIRMED" },
	[BookingStatus.PENDING]: { bg: "#F79432", color: "black", label: "PENDING APPROVAL" },
	[BookingStatus.CANCELLED]: { bg: "#444444", color: "#A7A7A7", label: "CANCELLED" },
	[BookingStatus.REJECTED]: { bg: "#444444", color: "#A7A7A7", label: "DECLINED" },
	[BookingStatus.FAILED]: { bg: "#444444", color: "#A7A7A7", label: "EXPIRED" },
	[BookingStatus.REFUNDED]: { bg: "#444444", color: "#A7A7A7", label: "REFUNDED" },
	// Not in BookingStatus — written by the mobile app / admin portal against the shared
	// collection. 6 live bookings carry it today.
	checked_in: { bg: "#123B2A", color: "#39D98A", border: "#39D98A", label: "CHECKED IN" },
}

const EVENT_STATUS_BADGE: Record<EventStatus, { bg: string; color: string; border?: string }> = {
	live: { bg: "#123B2A", color: "#39D98A", border: "#39D98A" },
	future: { bg: "#2A2A2A", color: "#E5E5E5", border: "#444444" },
	tbd: { bg: "#2A2A2A", color: "#A7A7A7", border: "#444444" },
	past: { bg: "#444444", color: "#A7A7A7" },
}

export type BookingRow = {
	_id: string
	bookingRef: string
	status: string
	total?: number
	ticketCount: number
	eventStatus: EventStatus
	moneyState: string
	/** Amount actually at stake — payment amount when there is one, booking total otherwise. */
	moneyAmount: number
	canCancel: boolean
	cancelBlockedReason?: string
	event: any
}

export default function BookingCard({ booking, onClick }: { booking: BookingRow; onClick: (b: BookingRow) => void }) {
	const event = booking.event || {}
	const cancelled = isCancelledBooking(booking)
	// The mobile app and admin portal share this collection and write statuses that
	// BookingStatus doesn't declare (`checked_in` is live today). Anything unrecognised and
	// not cancelled is an active booking, so fall back to the confirmed badge — never to
	// "pending approval", which would tell a guest their confirmed seat is in limbo.
	const badge = STATUS_BADGE[booking.status] || STATUS_BADGE[BookingStatus.CONFIRMED]
	const eventBadge = EVENT_STATUS_BADGE[booking.eventStatus] || EVENT_STATUS_BADGE.tbd

	const { formattedDate, formattedTime } = useMemo(() => {
		if (!event?.startsOn) return { formattedDate: "", formattedTime: "" }
		const date = dayjs.utc(event.startsOn).tz(getEventZone(event.timezone))
		return {
			formattedDate: date.format("MMMM DD, YYYY"),
			formattedTime: event?.hasStartTime !== false ? date.format("hh:mm A") : "",
		}
	}, [event?.startsOn, event?.timezone, event?.hasStartTime])

	return (
		<Box
			borderWidth="1px"
			borderColor="#434343"
			borderRadius="lg"
			overflow="hidden"
			bg="#1e1e1e"
			boxShadow="lg"
			height="470"
			cursor="pointer"
			opacity={cancelled ? 0.55 : 1}
			_hover={{ transform: "scale(1.03)", transition: "transform 0.2s ease-in-out" }}
			onClick={() => onClick(booking)}
		>
			<Box p="2" position="relative">
				<Flex position="absolute" top="4" left="4" zIndex="3" gap="1.5" align="center" wrap="wrap" maxW="85%">
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
						{badge.label}
					</Box>
					<Box
						bg={eventBadge.bg}
						color={eventBadge.color}
						border={eventBadge.border ? "1px solid" : undefined}
						borderColor={eventBadge.border}
						px="2"
						py="0.5"
						rounded="md"
						fontSize="xs"
						fontWeight="bold"
						letterSpacing="0.03em"
					>
						{STATUS_LABEL[booking.eventStatus] || "TBD"}
					</Box>
				</Flex>

				{event.images && event.images.length > 0 ? (
					<Image src={event.images[0]} alt={stripHtml(event.name || "")} objectFit="cover" w="100%" h="200px" rounded="lg" />
				) : (
					<Box
						w="100%"
						h="200px"
						rounded="lg"
						bg="#2A2D35"
						display="flex"
						alignItems="center"
						justifyContent="center"
						flexDirection="column"
						gap="2"
					>
						<Text fontSize="3xl">🖼️</Text>
						<Text fontSize="sm" color="gray.500">No image</Text>
					</Box>
				)}
			</Box>

			<Box p="2">
				<Stack spacing="3">
					<Text
						fontSize="xl"
						fontWeight="bold"
						wordBreak="break-word"
						overflowWrap="anywhere"
						textDecoration={cancelled ? "line-through" : undefined}
					>
						{stripHtml(event.name || "Event")}
					</Text>

					<Box h="24">
						<Text fontSize="sm" color="gray.500" suppressHydrationWarning display="flex" gap="2">
							<DateTimeSVG />
							{!event?.startsOn && !event?.endsOn && event?.datePoll?.isActive
								? "Date to be decided (Polling)"
								: event?.startsOn
									? `${formattedDate}${formattedTime ? ` ${formattedTime}` : ""}`
									: "Date to be decided"}
						</Text>
						<Text
							fontSize="sm"
							color="gray.500"
							suppressHydrationWarning
							display="flex"
							gap="2"
							mt="2"
							wordBreak="break-word"
							overflowWrap="anywhere"
						>
							{event.locationDisclosedAfterBooking
								? "📍 Location will be disclosed after registration"
								: <>
									<span><LocationSVG /></span>
									{event.location}
								</>}
						</Text>
					</Box>

					<Box display="flex" alignItems="center" justifyContent="space-between" mt="2">
						<Box fontSize="sm" color="gray.400">
							<Text>{booking.ticketCount} {booking.ticketCount === 1 ? "ticket" : "tickets"}</Text>
							<Text fontSize="xs" color="gray.500">Ref: {booking.bookingRef}</Text>
						</Box>

						<Box bg="#3E3E3E" w="max-content" px="3" py="1" rounded="lg">
							<Text className="uppercase text-xs font-semibold">
								{Number(booking.total || 0) > 0 ? `$${Number(booking.total).toFixed(2)}` : "Free"}
							</Text>
						</Box>
					</Box>
				</Stack>
			</Box>
		</Box>
	)
}
