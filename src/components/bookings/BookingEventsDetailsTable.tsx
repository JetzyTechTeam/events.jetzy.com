import React, { useState, useEffect } from "react"
import { Table, Thead, Tbody, Tr, Th, Td, TableCaption, TableContainer, Flex, Button, Text, Box, Badge, Spinner, Tooltip } from "@chakra-ui/react"
import { PlusCircleIcon } from "@heroicons/react/24/outline"

import { Exportable } from "@/pages/console/bookings"
import { downloadExcel } from "react-export-table-to-excel"
import { Booking } from "@/pages/console/bookings"
import { isCancelledBooking, isPendingBooking, isHoldExpired, deadBookingKind, deadBookingLabel, DEAD_BOOKING_LABEL, DEAD_BOOKING_COLOR, DEAD_BOOKING_TOOLTIP } from "@/lib/booking-status"
import { PaymentBadge } from "@/components/bookings/PaymentBadge"
import CancelBookingDialog from "@/components/bookings/CancelBookingDialog"
import { EditBookingDialog } from "@/components/console/approvals/EditBookingDialog"
import { useBookingEdit } from "@/components/console/approvals/useBookingEdit"
import { bookingMoneyAmount, bookingMoneyState, MoneyState } from "@/lib/booking-cancellation"
import { bookingTicketCount } from "@/lib/booking-approval"
import { isRequestAdjusted, plannedTickets } from "@/lib/booking-request-edit"
import { bookingMemberships } from "@/lib/booking-memberships"

type Props = {
	rows: Booking[]
	exportable: Exportable[]
	checkInMap: Record<string, { checkedInCount: number; isFullyCheckedIn: boolean }>
	isAdmin?: boolean
	/**
	 * True when the viewer may act on these bookings — admin OR the event's owner. The page
	 * only renders for those two, so this is effectively always true; it stays an explicit
	 * prop rather than reusing `isAdmin` (which gates Delete) so a host gets Cancel without
	 * also getting Delete.
	 */
	canManage?: boolean
	/**
	 * The event's ticket types, so the edit dialog can name the rows a booking holds — a
	 * booking stores `ticketId` only. Omit it and the Edit action isn't offered.
	 *
	 * `price` / `memberships` / `includesPremium` let the editor refuse up front an added seat on
	 * a ticket that has since become paid or bundled.
	 */
	eventTickets?: Array<{ _id: string; name: string; price?: number; memberships?: string[]; includesPremium?: boolean }>
	onDeleteSuccess?: () => void
	onCancelSuccess?: () => void
	onEditSuccess?: () => void
}

const BookingTableComponent: React.FC<Props> = ({ rows, exportable, checkInMap, isAdmin, canManage, eventTickets, onDeleteSuccess, onCancelSuccess, onEditSuccess }) => {
	const [loading, setLoading] = useState(false)
	const [deletingRef, setDeletingRef] = useState<string | null>(null)
	const [cancellingRef, setCancellingRef] = useState<string | null>(null)
	const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
	const [localRows, setLocalRows] = useState(rows)

	// Every live row — pending request or confirmed booking — opens the ONE booking editor every
	// screen shares. What it may change is `bookingEditMode`'s call, and the save goes to the
	// endpoint whose rules match the booking. This table used to have its own tickets-only
	// dialog for confirmed free bookings; that is gone, so the rules can't drift apart again.
	const requestEditor = useBookingEdit({
		onSettled: (saved) => {
			if (saved) onEditSuccess?.()
		},
	})

	// Re-sync when SSR returns new rows (e.g. after applying search/filters);
	// the component stays mounted on client navigation so useState won't reseed.
	useEffect(() => {
		setLocalRows(rows)
	}, [rows])

	const exportTableHeaders = ["Reference", "Event", "Amount", "Status", "Customer", "Tickets", "Check-in", "Date"]

	const exportTableData = exportable.map((row) => [
		row.booking.bookingRef,
		row.event.name,
		row.booking.total.toLocaleString("en-US", { style: "currency", currency: "USD" }),
		// Same three-way distinction the table draws — an export that says "failed" where
		// the screen says "Expired" sends the host back to ask what it means.
		deadBookingLabel(row.booking),
		`${row.booking.customerName} | ${row.booking.customerEmail} | ${row.booking.customerPhone}`,
		row.bookedTickets.length > 0 ? row.bookedTickets.join(", ") : "No-ticket event",
		checkInMap[row.booking._id?.toString()]?.checkedInCount > 0
			? (checkInMap[row.booking._id?.toString()].isFullyCheckedIn ? "Fully Checked In" : `Partial (${checkInMap[row.booking._id?.toString()].checkedInCount})`)
			: "Not Checked In",
		new Date(row.booking.createdAt).toLocaleString(),
	])

	const handleExport = () => {
		downloadExcel({
			fileName: "Bookings-Export",
			sheet: "Bookings",
			tablePayload: {
				header: exportTableHeaders,
				body: exportTableData,
			},
		})
	}

	const handleDelete = async (bookingRef: string) => {
		if (!confirm(`Delete booking ${bookingRef}? This cannot be undone.`)) return
		setDeletingRef(bookingRef)
		try {
			const res = await fetch("/api/bookings/delete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ bookingRef }),
			})
			const data = await res.json()
			if (data.status) {
				setLocalRows(prev => prev.filter(r => r.bookingRef !== bookingRef))
				onDeleteSuccess?.()
			} else {
				alert(data.message || "Failed to delete booking.")
			}
		} catch {
			alert("Network error.")
		} finally {
			setDeletingRef(null)
		}
	}

	// Cancelling never returns money — Jetzy issues no refunds. A captured payment stays
	// captured; only an uncaptured hold is released. The dialog says so explicitly.
	const handleCancel = async () => {
		if (!cancelTarget) return
		const bookingRef = cancelTarget.bookingRef
		setCancellingRef(bookingRef)
		try {
			const res = await fetch("/api/bookings/cancel", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ bookingRef }),
			})
			const data = await res.json()
			if (data.status) {
				setLocalRows(prev => prev.map(r => (r.bookingRef === bookingRef ? { ...r, status: "cancelled" } : r)))
				setCancelTarget(null)
				onCancelSuccess?.()
			} else {
				alert(data.message || "Failed to cancel booking.")
			}
		} catch {
			alert("Network error.")
		} finally {
			setCancellingRef(null)
		}
	}

	/**
	 * Every live booking: the name can always be corrected, and the dialog decides what the
	 * quantity may do (a paid confirmed booking shows it locked, with the reason). Not on a dead
	 * booking, and not on a request whose card hold has lapsed — it can no longer be approved,
	 * so there is nothing an edit could lead to.
	 */
	const canEdit = (booking: Booking) =>
		!!canManage && !!eventTickets && !isCancelledBooking(booking) && !(isPendingBooking(booking) && isHoldExpired(booking as any))

	// Every cell of a booking row, built ONCE and laid out twice: as table cells from `md` up
	// and as a card below it. Moved here verbatim from the table, so the two layouts cannot
	// disagree about a status, a payment state or which actions a booking allows.
	const bookingCells = (row: Booking) => {
		const ci = checkInMap[row._id.toString()]
		const cancelled = isCancelledBooking(row)
		// `failed` used to print raw, so an expired hold read as the literal word
		// "failed" beside real cancellations. It means nobody approved in time.
		const deadKind = deadBookingKind(row)

		const reference = (
			<Button
				variant="link"
				color='white'
				overflow="hidden"
				whiteSpace="nowrap"
				textOverflow="ellipsis"
				textDecoration={cancelled ? "line-through" : undefined}
			>
				{row.bookingRef}
			</Button>
		)
		const amount = row.total.toLocaleString("en-US", { style: "currency", currency: "USD" })
		const status = (
			<>
				{deadKind ? (
					<Tooltip hasArrow label={DEAD_BOOKING_TOOLTIP[deadKind]}>
						<Badge colorScheme={DEAD_BOOKING_COLOR[deadKind]}>{DEAD_BOOKING_LABEL[deadKind]}</Badge>
					</Tooltip>
				) : (
					<Badge colorScheme={row.status === "pending" ? "yellow" : "green"}>{row.status}</Badge>
				)}
			</>
		)
		const payment = (
			<>
				{row.payment?.status
					? <PaymentBadge booking={row} />
					: Number(row.total || 0) > 0
						// Priced but no payment record — not the same thing as free.
						? <Text color="#9C9C9C">Not recorded</Text>
						: <Text color="#9C9C9C">Free</Text>}
			</>
		)
		const ticketsBadge = (() => {
			// What a pending request WILL be approved for — the edited number when a host has
			// lowered it, with what was asked for alongside. `plannedTickets` returns the
			// booking's own rows for anything that isn't a pending request.
			const qty = bookingTicketCount(plannedTickets(row as any))
			const asked = bookingTicketCount(row.tickets)
			return qty > 0 ? (
				<>
					<Badge colorScheme="blue" fontSize={"smaller"}>
						{qty} tickets
					</Badge>
					{isRequestAdjusted(row as any) && (
						<Badge ml={1} colorScheme="orange" fontSize={"smaller"}>
							edited · asked for {asked}
						</Badge>
					)}
				</>
			) : (
				<Badge colorScheme="purple" fontSize={"smaller"}>
					No-ticket event
				</Badge>
			)
		})()
		const customer = (
			<Box>
				<Text>{row.customerName}</Text>
				<Text fontSize={"small"}>{row.customerEmail}</Text>
				<Text fontSize={"smaller"}>{row.customerPhone}</Text>
				{ticketsBadge}
			</Box>
		)
		const checkIn = (
			<>
				{deadKind ? (
					<Badge colorScheme={DEAD_BOOKING_COLOR[deadKind]}>{DEAD_BOOKING_LABEL[deadKind]}</Badge>
				) : ci?.checkedInCount > 0 ? (
					<Badge colorScheme="green">
						{ci.isFullyCheckedIn ? "Fully Checked In" : `Partial (${ci.checkedInCount})`}
					</Badge>
				) : (
					<Badge colorScheme="gray">Not Checked In</Badge>
				)}
			</>
		)
		const date = new Date(row.createdAt).toLocaleString()
		const actions = (
			<Flex gap={1}>
				{/* One Edit per live row, pending or confirmed — the same editor every screen opens. */}
				{canEdit(row) && (
					<Button
						size="xs"
						colorScheme="blue"
						variant="ghost"
						isLoading={requestEditor.isSavingEdit && requestEditor.editTarget?.bookingRef === row.bookingRef}
						onClick={() => requestEditor.requestEdit(row)}
					>
						Edit
					</Button>
				)}
				{canManage && !cancelled && (
					<Button
						size="xs"
						colorScheme="orange"
						variant="ghost"
						isLoading={cancellingRef === row.bookingRef}
						onClick={() => setCancelTarget(row)}
					>
						Cancel
					</Button>
				)}
				{isAdmin && (
					<Button
						size="xs"
						colorScheme="red"
						variant="ghost"
						isLoading={deletingRef === row.bookingRef}
						onClick={() => handleDelete(row.bookingRef)}
					>
						Delete
					</Button>
				)}
			</Flex>
		)
		return { cancelled, reference, amount, status, payment, ticketsBadge, customer, checkIn, date, actions }
	}

	if (loading) {
		return (
			<Flex justify="center" align="center" height="300px">
				<Spinner size="xl" thickness="4px" color="blue.500" />
			</Flex>
		)
	}

	return (
		<>
			{/* Phones: one card per booking. Eight columns of table were a sideways scroll. */}
			<Box display={{ base: "block", md: "none" }}>
				<Button
					w="full"
					h="44px"
					mb={3}
					variant="outline"
					colorScheme="blue"
					onClick={handleExport}
					leftIcon={<PlusCircleIcon style={{ width: 20, height: 20 }} />}
				>
					Export
				</Button>
				{localRows.length === 0 && <Text color="#9C9C9C" fontSize="sm">No bookings found.</Text>}
				<Flex direction="column" gap={3}>
					{localRows.map((row) => {
						const c = bookingCells(row)
						return (
							<Box key={row._id.toString()} bg="#101010" border="1px solid #343536" borderRadius="12px" p={4} opacity={c.cancelled ? 0.6 : 1}>
								<Flex justify="space-between" align="flex-start" gap={3}>
									<Box minW={0} flex="1">
										<Text color="white" fontWeight={700} fontSize="15px" noOfLines={1}>{row.customerName}</Text>
										<Text color="#9C9C9C" fontSize="13px" wordBreak="break-all">{row.customerEmail}</Text>
										{row.customerPhone && <Text color="#9C9C9C" fontSize="12px">{row.customerPhone}</Text>}
									</Box>
									<Box flexShrink={0}>{c.status}</Box>
								</Flex>
								<Flex mt={3} gap={3} align="center" wrap="wrap" fontSize="13px">
									<Text color="white" fontWeight={700} fontSize="15px">{c.amount}</Text>
									<Box>{c.payment}</Box>
								</Flex>
								<Flex mt={2} gap={2} align="center" wrap="wrap">
									{c.ticketsBadge}
									{c.checkIn}
								</Flex>
								<Text mt={3} color="#9C9C9C" fontSize="12px" wordBreak="break-all" textDecoration={c.cancelled ? "line-through" : undefined}>
									{row.bookingRef}
								</Text>
								<Text color="#9C9C9C" fontSize="12px">{c.date}</Text>
								{(isAdmin || canManage) && (
									<Box
										mt={3}
										pt={3}
										borderTop="1px solid #2A2D31"
										// Same buttons, same guards as the table row - only made tappable.
										sx={{ "@media screen and (max-width: 47.99em)": { "& button": { height: "36px", paddingLeft: "12px", paddingRight: "12px", fontSize: "13px" } } }}
									>
										{c.actions}
									</Box>
								)}
							</Box>
						)
					})}
				</Flex>
			</Box>
			<TableContainer display={{ base: "none", md: "block" }} bg="#181818" width={"full"} borderRadius="md" boxShadow="md" p={2} mx={2}>
				<Table width="full">
					<TableCaption placement="top">
						<Button variant="outline" colorScheme="blue" onClick={handleExport} leftIcon={<PlusCircleIcon style={{ width: 20, height: 20 }} />}>
							Export
						</Button>
					</TableCaption>
					<TableCaption>Event Bookings.</TableCaption>
					<Thead>
						<Tr>
							<Th>Reference</Th>
							<Th>Amount</Th>
							<Th>Status</Th>
							<Th>Payment</Th>
							<Th>Customer</Th>
							<Th>Check-in</Th>
							<Th>Date</Th>
							{(isAdmin || canManage) && <Th></Th>}
						</Tr>
					</Thead>
					<Tbody>
						{localRows.map((row) => {
							const c = bookingCells(row)
							return (
								<Tr key={row._id.toString()} opacity={c.cancelled ? 0.55 : 1}>
									<Td fontWeight={"bold"}>{c.reference}</Td>
									<Td>{c.amount}</Td>
									<Td>{c.status}</Td>
									<Td>{c.payment}</Td>
									<Td>{c.customer}</Td>
									<Td>{c.checkIn}</Td>
									<Td>{c.date}</Td>
									{(isAdmin || canManage) && <Td>{c.actions}</Td>}
								</Tr>
							)
						})}
					</Tbody>
				</Table>
			</TableContainer>

			<CancelBookingDialog
				isOpen={!!cancelTarget}
				onClose={() => setCancelTarget(null)}
				onConfirm={handleCancel}
				isLoading={!!cancellingRef}
				moneyState={(cancelTarget ? bookingMoneyState(cancelTarget as any) : "free") as MoneyState}
				amount={cancelTarget ? bookingMoneyAmount(cancelTarget as any) : 0}
				memberships={bookingMemberships((cancelTarget as any)?.payment) as any}
				asManager
				guestName={cancelTarget?.customerName}
			/>

			<EditBookingDialog controller={requestEditor} eventTickets={eventTickets} />
		</>
	)
}

export default BookingTableComponent
