import React from "react"
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td, TableCaption, TableContainer, IconButton, Menu, MenuButton, MenuList, MenuItem, Flex, Button, Text, useDisclosure, Box, Badge } from "@chakra-ui/react"
import { EllipsisVerticalIcon, EyeIcon, PencilIcon, PlusCircleIcon, TrashIcon } from "@heroicons/react/24/outline"
import { Pagination } from "@/pages/console/events"
import { IBookings, IEvent } from "@/models/events/types"
import { Exportable } from "@/pages/console/bookings"
import { downloadExcel } from "react-export-table-to-excel"

type Props = {
	rows: IBookings[]
	pagination: Pagination
	exportable: Exportable[]
}
const BookingTableComponent: React.FC<Props> = ({ rows, pagination, exportable }) => {
	const exportTableHeaders = ["Reference", "Event", "Amount", "Status", "Customer", "Tickets", "Date"]

	const exportTableData = exportable.map((row) => [
		row.booking.bookingRef,
		row.event.name,
		row.booking.total.toLocaleString("en-US", { style: "currency", currency: "USD" }),
		row.booking.status,
		`${row.booking.customerName} | ${row.booking.customerEmail} | ${row.booking.customerPhone}`,
		row.bookedTickets.join(", "),
		new Date(row.booking.createdAt).toDateString(),
	])

	const handleExport = () => {
		downloadExcel({
			fileName: "Bookings-Export",
			sheet: "Bookings",
			tablePayload: {
				header: exportTableHeaders,
				// accept two different data structures
				body: exportTableData,
			},
		})
	}

	return (
		<>
			<TableContainer bg="white" width={"full"} borderRadius="md" boxShadow="md" p={2} mx={2}>
				<Table variant="striped" colorScheme="gray" width="full">
					<TableCaption placement="top">
						{/* Export button  */}
						<Button variant="outline" colorScheme="blue" onClick={handleExport} leftIcon={<PlusCircleIcon style={{ width: 20, height: 20 }} />}>
							Export
						</Button>
					</TableCaption>
					<TableCaption>Event Bookings.</TableCaption>
					<Thead>
						<Tr>
							<Th>Reference</Th>
							<Th>Event</Th>
							<Th>Amount</Th>
							<Th>Status</Th>
							<Th>Customer</Th>
							<Th>Date</Th>
							<Th isNumeric>Actions</Th>
						</Tr>
					</Thead>
					<Tbody>
						{rows.map((row) => (
							<Tr key={row._id.toString()}>
								<Td fontWeight={"bold"}>
									<Button
										variant="link"
										colorScheme="blue"
										// handle text overflow to truncate
										overflow="hidden"
										whiteSpace="nowrap"
										textOverflow="ellipsis"
									>
										{row.bookingRef}
									</Button>
								</Td>

								<Td>
									<Button variant="link" colorScheme="blue">
										{row.event.name.slice(0, 10)}...
									</Button>
								</Td>

								<Td>{row.total.toLocaleString("en-US", { style: "currency", currency: "USD" })}</Td>
								<Td>{row.status}</Td>
								<Td>
									{/* Stack of customer name, email and phone with total tickets booked */}
									<Box>
										<Text>{row.customerName}</Text>
										<Text fontSize={"small"}>{row.customerEmail}</Text>
										<Text fontSize={"smaller"}>{row.customerPhone}</Text>
										<Badge colorScheme="blue" fontSize={"smaller"}>
											{row.tickets.length} tickets
										</Badge>
									</Box>
								</Td>
								<Td>{new Date(row.createdAt).toDateString()}</Td>
								<Td>
									<Menu placement="top-end">
										<MenuButton as={IconButton} aria-label="Options" icon={<EllipsisVerticalIcon style={{ width: 20, height: 20 }} />} variant="outline" />
										<MenuList>
											<MenuItem icon={<PencilIcon style={{ width: 20, height: 20 }} />}>Confirm</MenuItem>
											<MenuItem icon={<TrashIcon style={{ width: 20, height: 20 }} />}>View</MenuItem>
										</MenuList>
									</Menu>
								</Td>
							</Tr>
						))}
					</Tbody>
					<Tfoot>
						<Tr>
							<Td colSpan={7}>
								<Flex justify="center" align="center" mt={4}>
									<Button
										variant="link"
										//   onClick={handlePrev}
										disabled={pagination.page === 1}
										mr={2}
									>
										&lt;Prev
									</Button>
									<Text fontSize="sm" color="gray.600">
										Page {pagination.page} | showing {pagination.showing} of {pagination.total}
									</Text>
									<Button
										variant="link"
										//   onClick={handleNext}
										disabled={pagination.page === pagination.totalPages}
										ml={2}
									>
										Next&gt;
									</Button>
								</Flex>
							</Td>
						</Tr>
					</Tfoot>
				</Table>
			</TableContainer>
		</>
	)
}

export default BookingTableComponent
