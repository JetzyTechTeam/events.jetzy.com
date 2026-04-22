import React, { useState } from "react"
import { Table, Thead, Tbody, Tr, Th, Td, TableCaption, TableContainer, Flex, Button, Text, Box, Badge, Spinner } from "@chakra-ui/react"
import { PlusCircleIcon } from "@heroicons/react/24/outline"

import { Exportable } from "@/pages/console/bookings"
import { downloadExcel } from "react-export-table-to-excel"
import { Booking } from "@/pages/console/bookings"

type Props = {
	rows: Booking[]
	exportable: Exportable[]
	checkInMap: Record<string, { checkedInCount: number; isFullyCheckedIn: boolean }>
}

const BookingTableComponent: React.FC<Props> = ({ rows, exportable, checkInMap }) => {
	const [loading, setLoading] = useState(false)

	const exportTableHeaders = ["Reference", "Event", "Amount", "Status", "Customer", "Tickets", "Check-in", "Date"]

	const exportTableData = exportable.map((row) => [
		row.booking.bookingRef,
		row.event.name,
		row.booking.total.toLocaleString("en-US", { style: "currency", currency: "USD" }),
		row.booking.status,
		`${row.booking.customerName} | ${row.booking.customerEmail} | ${row.booking.customerPhone}`,
		row.bookedTickets.join(", "),
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
							<Th>Customer</Th>
							<Th>Check-in</Th>
							<Th>Date</Th>
						</Tr>
					</Thead>
					<Tbody>
						{rows.map((row) => {
							const ci = checkInMap[row._id.toString()]
							return (
								<Tr key={row._id.toString()}>
									<Td fontWeight={"bold"}>
										<Button
											variant="link"
											color='white'
											overflow="hidden"
											whiteSpace="nowrap"
											textOverflow="ellipsis"
										>
											{row.bookingRef}
										</Button>
									</Td>
									<Td>{row.total.toLocaleString("en-US", { style: "currency", currency: "USD" })}</Td>
									<Td>{row.status}</Td>
									<Td>
										<Box>
											<Text>{row.customerName}</Text>
											<Text fontSize={"small"}>{row.customerEmail}</Text>
											<Text fontSize={"smaller"}>{row.customerPhone}</Text>
											<Badge colorScheme="blue" fontSize={"smaller"}>
												{row.tickets.reduce((sum, t) => sum + (t.quantity || 0), 0)} tickets
											</Badge>
										</Box>
									</Td>
									<Td>
										{ci?.checkedInCount > 0 ? (
											<Badge colorScheme="green">
												{ci.isFullyCheckedIn ? "Fully Checked In" : `Partial (${ci.checkedInCount})`}
											</Badge>
										) : (
											<Badge colorScheme="gray">Not Checked In</Badge>
										)}
									</Td>
									<Td>{new Date(row.createdAt).toLocaleString()}</Td>
								</Tr>
							)
						})}
					</Tbody>
				</Table>
			</TableContainer>
		</>
	)
}

export default BookingTableComponent
