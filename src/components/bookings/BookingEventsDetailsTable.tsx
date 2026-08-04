import React, { useState, useEffect } from "react"
import { Table, Thead, Tbody, Tr, Th, Td, TableCaption, TableContainer, Flex, Button, Text, Box, Badge, Spinner } from "@chakra-ui/react"
import { PlusCircleIcon } from "@heroicons/react/24/outline"

import { Exportable } from "@/pages/console/bookings"
import { downloadExcel } from "react-export-table-to-excel"
import { Booking } from "@/pages/console/bookings"
import { isCancelledBooking } from "@/lib/booking-status"
import { PaymentBadge } from "@/components/bookings/PaymentBadge"
import CancelBookingDialog from "@/components/bookings/CancelBookingDialog"
import { bookingMoneyAmount, bookingMoneyState, MoneyState } from "@/lib/booking-cancellation"

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
	onDeleteSuccess?: () => void
	onCancelSuccess?: () => void
}

const BookingTableComponent: React.FC<Props> = ({ rows, exportable, checkInMap, isAdmin, canManage, onDeleteSuccess, onCancelSuccess }) => {
	const [loading, setLoading] = useState(false)
	const [deletingRef, setDeletingRef] = useState<string | null>(null)
	const [cancellingRef, setCancellingRef] = useState<string | null>(null)
	const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
	const [localRows, setLocalRows] = useState(rows)

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
		row.booking.status,
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

	if (loading) {
		return (
			<Flex justify="center" align="center" height="300px">
				<Spinner size="xl" thickness="4px" color="blue.500" />
			</Flex>
		)
	}

	return (
		<>
			<TableContainer bg="#181818" width={"full"} borderRadius="md" boxShadow="md" p={2} mx={2}>
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
							const ci = checkInMap[row._id.toString()]
							const cancelled = isCancelledBooking(row)
							return (
								<Tr key={row._id.toString()} opacity={cancelled ? 0.55 : 1}>
									<Td fontWeight={"bold"}>
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
									</Td>
									<Td>{row.total.toLocaleString("en-US", { style: "currency", currency: "USD" })}</Td>
									<Td>
										<Badge colorScheme={cancelled ? "red" : row.status === "pending" ? "yellow" : "green"}>{row.status}</Badge>
									</Td>
									<Td>
										{row.payment?.status
											? <PaymentBadge booking={row} />
											: Number(row.total || 0) > 0
												// Priced but no payment record — not the same thing as free.
												? <Text color="#9C9C9C">Not recorded</Text>
												: <Text color="#9C9C9C">Free</Text>}
									</Td>
									<Td>
										<Box>
											<Text>{row.customerName}</Text>
											<Text fontSize={"small"}>{row.customerEmail}</Text>
											<Text fontSize={"smaller"}>{row.customerPhone}</Text>
											{(() => {
												const qty = row.tickets.reduce((sum, t) => sum + (t.quantity || 0), 0)
												return qty > 0 ? (
													<Badge colorScheme="blue" fontSize={"smaller"}>
														{qty} tickets
													</Badge>
												) : (
													<Badge colorScheme="purple" fontSize={"smaller"}>
														No-ticket event
													</Badge>
												)
											})()}
										</Box>
									</Td>
									<Td>
										{cancelled ? (
											<Badge colorScheme="red">Cancelled</Badge>
										) : ci?.checkedInCount > 0 ? (
											<Badge colorScheme="green">
												{ci.isFullyCheckedIn ? "Fully Checked In" : `Partial (${ci.checkedInCount})`}
											</Badge>
										) : (
											<Badge colorScheme="gray">Not Checked In</Badge>
										)}
									</Td>
									<Td>{new Date(row.createdAt).toLocaleString()}</Td>
									{(isAdmin || canManage) && (
										<Td>
											<Flex gap={1}>
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
										</Td>
									)}
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
				asManager
				guestName={cancelTarget?.customerName}
			/>
		</>
	)
}

export default BookingTableComponent
