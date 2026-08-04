import React, { useMemo, useState } from "react"
import {
	Badge,
	Box,
	Button,
	Divider,
	Flex,
	Modal,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalOverlay,
	Text,
} from "@chakra-ui/react"
import NextLink from "next/link"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { eventPath } from "@/lib/event-slug"
import { getEventZone, formatEventZoneLabel } from "@/utils/eventTime"
import { pricingFromBooking } from "@/lib/ticket-pricing"
import { stripHtml } from "@/utils/text"
import { PaymentBadge, HoldExpiry } from "@/components/bookings/PaymentBadge"
import { isAuthorizedHold } from "@/lib/booking-status"
import { MoneyState } from "@/lib/booking-cancellation"
import { BookingRow } from "./BookingCard"
import { BookingStatus } from "@/models/events/types"

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Everything a guest can know about one of their bookings. Follows the house modal recipe
 * (#1E1E1E surface, #9C9C9C labels) used by the console guest-detail modal so the two read
 * as the same product.
 */

const STATUS_COLOR: Record<string, string> = {
	[BookingStatus.CONFIRMED]: "green",
	[BookingStatus.APPROVED]: "green",
	[BookingStatus.PENDING]: "yellow",
	[BookingStatus.CANCELLED]: "red",
	[BookingStatus.REJECTED]: "red",
	[BookingStatus.FAILED]: "red",
	[BookingStatus.REFUNDED]: "gray",
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
	<Box minW="150px">
		<Text fontSize="xs" color="#9C9C9C" mb={1}>{label}</Text>
		<Box fontWeight="semibold">{children}</Box>
	</Box>
)

type Props = {
	booking: BookingRow | null
	isOpen: boolean
	onClose: () => void
	onCancel: (booking: BookingRow) => void
	isCancelling?: boolean
}

export default function BookingDetailModal({ booking, isOpen, onClose, onCancel, isCancelling = false }: Props) {
	const event = booking?.event || {}

	const dateLine = useMemo(() => {
		if (!booking) return ""
		if (!event?.startsOn && !event?.endsOn) {
			return event?.datePoll?.isActive ? "Date to be decided (Polling)" : "Date to be decided"
		}
		const zone = getEventZone(event.timezone)
		const start = event.startsOn ? dayjs.utc(event.startsOn).tz(zone) : null
		const end = event.endsOn ? dayjs.utc(event.endsOn).tz(zone) : null
		const startStr = start ? `${start.format("MMMM DD, YYYY")}${event.hasStartTime !== false ? ` ${start.format("hh:mm A")}` : ""}` : ""
		const endStr = end ? `${end.format("MMMM DD, YYYY")}${event.hasEndTime !== false ? ` ${end.format("hh:mm A")}` : ""}` : ""
		if (startStr && endStr) return `${startStr} — ${endStr}`
		return startStr || endStr
	}, [booking, event])

	// Ticket rows carry no price snapshot, so names and prices come from the event's current
	// ticket definitions. A host who re-prices after the fact changes what is shown here.
	const ticketRows = useMemo(() => {
		if (!booking) return []
		const map = new Map<string, any>()
		for (const t of event.tickets || []) map.set(String(t._id), t)
		return (booking as any).tickets?.map((bt: any) => {
			const meta = map.get(String(bt.ticketId))
			return { name: meta?.name || "Ticket", price: Number(meta?.price) || 0, quantity: bt.quantity }
		}) || []
	}, [booking, event])

	const pricing = useMemo(() => (booking ? pricingFromBooking(booking as any) : null), [booking])

	if (!booking) return null

	const moneyState = booking.moneyState as MoneyState
	const answers = (booking as any).customAnswers || []
	const questionMap = new Map<string, any>()
	for (const q of event.questions || []) questionMap.set(String(q.id), q)

	return (
		<Modal isOpen={isOpen} onClose={onClose} isCentered size="2xl" scrollBehavior="inside">
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white">
				<ModalHeader borderBottom="1px solid #3E3E3E">Booking Details</ModalHeader>
				<ModalCloseButton />
				<ModalBody pb={6}>
					<Flex gap={6} wrap="wrap" mb={5}>
						<Field label="Booking Reference">{booking.bookingRef}</Field>
						<Field label="Status">
							<Badge colorScheme={STATUS_COLOR[booking.status] || "gray"}>{booking.status}</Badge>
						</Field>
						<Field label="Payment">
							{moneyState === "free" ? (
								<Text color="#9C9C9C">Free booking</Text>
							) : moneyState === "unknown" ? (
								// Priced but with no payment record — saying "Free booking" here would be
								// wrong for the 200+ legacy bookings in this state.
								<Text color="#9C9C9C">Not recorded</Text>
							) : (
								<PaymentBadge booking={booking} />
							)}
						</Field>
						{isAuthorizedHold(booking as any) && (
							<Field label="Hold expires"><HoldExpiry booking={booking} /></Field>
						)}
					</Flex>

					<Divider borderColor="#3E3E3E" mb={5} />

					<Text fontSize="xs" color="#9C9C9C" mb={1}>Event</Text>
					{event.slug || event._id ? (
						<NextLink href={eventPath(event.slug || event._id)} target="_blank">
							<Text fontWeight="bold" fontSize="lg" color="#F79432" _hover={{ textDecoration: "underline" }}>
								{stripHtml(event.name || "Event")}
							</Text>
						</NextLink>
					) : (
						<Text fontWeight="bold" fontSize="lg">{stripHtml(event.name || "Event")}</Text>
					)}

					<Flex gap={6} wrap="wrap" mt={4} mb={5}>
						<Field label="Date & Time">
							<Text fontWeight="normal">{dateLine}</Text>
							{event.timezone && <Text fontSize="xs" color="#9C9C9C">{formatEventZoneLabel(event.timezone)}</Text>}
						</Field>
						<Field label="Location">
							<Text fontWeight="normal">
								{event.locationDisclosedAfterBooking && !event.location
									? "Disclosed after registration"
									: event.location || "—"}
							</Text>
						</Field>
					</Flex>

					<Divider borderColor="#3E3E3E" mb={5} />

					<Text fontSize="xs" color="#9C9C9C" mb={2}>Tickets</Text>
					{ticketRows.map((t: any, i: number) => (
						<Flex key={i} justify="space-between" bg="#2A2A2A" rounded="lg" px={4} py={3} mb={2}>
							<Box>
								<Text fontWeight="semibold">{t.name}</Text>
								<Text fontSize="sm" color="#9C9C9C">Qty {t.quantity}</Text>
							</Box>
							<Text fontWeight="semibold">{t.price > 0 ? `$${(t.price * t.quantity).toFixed(2)}` : "Free"}</Text>
						</Flex>
					))}

					{pricing && Number(booking.total || 0) > 0 && (
						<Box bg="#2A2A2A" rounded="lg" px={4} py={3} mt={3}>
							<Flex justify="space-between" fontSize="sm" color="#9C9C9C">
								<Text>Subtotal</Text>
								<Text>${pricing.subtotal.toFixed(2)}</Text>
							</Flex>
							{pricing.lines.map((line, i) => (
								<Flex key={i} justify="space-between" fontSize="sm" color="#39D98A" mt={1}>
									<Text>{line.label}</Text>
									<Text>-${line.amount.toFixed(2)}</Text>
								</Flex>
							))}
							<Divider borderColor="#3E3E3E" my={2} />
							<Flex justify="space-between" fontWeight="bold">
								<Text>Total</Text>
								<Text>${pricing.total.toFixed(2)}</Text>
							</Flex>
						</Box>
					)}

					{answers.length > 0 && (
						<>
							<Divider borderColor="#3E3E3E" my={5} />
							<Text fontSize="xs" color="#9C9C9C" mb={2}>Your Answers</Text>
							{answers.map((a: any, i: number) => {
								const q = questionMap.get(String(a.questionId))
								const value = Array.isArray(a.answer) ? a.answer.join(", ") : String(a.answer ?? "")
								return (
									<Box key={i} bg="#2A2A2A" rounded="lg" px={4} py={3} mb={2}>
										<Text fontSize="sm" color="#F79432" mb={1}>{q?.title || "Question"}</Text>
										<Text fontSize="sm">{value || "—"}</Text>
									</Box>
								)
							})}
						</>
					)}

					{!booking.canCancel && booking.cancelBlockedReason && (
						<Box bg="#2A2A2A" rounded="lg" px={4} py={3} mt={5}>
							<Text fontSize="sm" color="#9C9C9C">{booking.cancelBlockedReason}</Text>
						</Box>
					)}
				</ModalBody>

				<ModalFooter borderTop="1px solid #3E3E3E" gap={3}>
					<Button variant="ghost" color="#9C9C9C" _hover={{ bg: "#2A2D31", color: "white" }} onClick={onClose}>
						Close
					</Button>
					{booking.canCancel && (
						<Button colorScheme="red" onClick={() => onCancel(booking)} isLoading={isCancelling}>
							Cancel booking
						</Button>
					)}
				</ModalFooter>
			</ModalContent>
		</Modal>
	)
}
