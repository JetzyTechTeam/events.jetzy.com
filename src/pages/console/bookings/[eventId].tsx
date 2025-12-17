import { GetServerSideProps } from "next"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { Bookings } from "@/models/events/bookings"
import { Events } from "@/models/events"
import { Pages } from "@/types"
import { Booking } from "."
import { adminOnly } from "@/lib/authSession"
import Head from "next/head"
import React, { useState, useMemo } from "react"
import Link from "next/link"
import { downloadExcel } from "react-export-table-to-excel"
import { 
	ChevronLeftIcon, 
	ArrowDownTrayIcon, 
	MagnifyingGlassIcon, 
	FunnelIcon, 
	XCircleIcon,
	CurrencyDollarIcon,
	TicketIcon,
	UserIcon,
	CalendarIcon,
	MapPinIcon,
	ClockIcon,
	CheckBadgeIcon,
	EllipsisHorizontalIcon
} from "@heroicons/react/24/outline"
import { 
	Box, 
	Flex, 
	Text, 
	Button, 
	Input, 
	Select, 
	Table, 
	Thead, 
	Tbody, 
	Tr, 
	Th, 
	Td, 
	Badge, 
	Menu, 
	MenuButton, 
	MenuList, 
	MenuItem, 
	IconButton,
	Avatar,
	SimpleGrid
} from "@chakra-ui/react"

type Props = {
	bookings: Booking[]
	event: { _id: string; name: string; startsOn: string; endsOn: string; location?: string }
	filters: { status?: string; search?: string; date?: string; amount?: string; minTickets?: string }
	exportable: any[]
}

export default function BookingsEventPage({ bookings, event, filters, exportable }: Props) {
	const [activeTab, setActiveTab] = useState<"bookings" | "waiting-list">("bookings")
	const [currentFilters, setCurrentFilters] = useState(filters)
	const [currentPage, setCurrentPage] = useState(1)
	const itemsPerPage = 10

	// Calculate statistics
	const statistics = useMemo(() => {
		const activeBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "approved")
		const canceledBookings = bookings.filter((b) => b.status === "cancelled")

		const activeTickets = activeBookings.reduce((sum, b) => sum + b.tickets.reduce((ticketSum, t) => ticketSum + t.quantity, 0), 0)
		const canceledTickets = canceledBookings.reduce((sum, b) => sum + b.tickets.reduce((ticketSum, t) => ticketSum + t.quantity, 0), 0)

		const uniqueActiveCustomers = new Set(activeBookings.map((b) => b.customerEmail)).size
		const uniqueCanceledCustomers = new Set(canceledBookings.map((b) => b.customerEmail)).size
		
		const totalRevenue = activeBookings.reduce((sum, b) => sum + b.total, 0)

		return {
			activeTickets,
			activeCustomers: uniqueActiveCustomers,
			canceledTickets,
			canceledCustomers: uniqueCanceledCustomers,
			totalRevenue
		}
	}, [bookings])

	// Export function
	const handleExport = () => {
		const exportTableHeaders = ["Reference", "Event", "Amount", "Status", "Customer", "Tickets", "Date"]
		const exportTableData = exportable.map((row) => [
			row.booking.bookingRef,
			row.event.name,
			row.booking.total.toLocaleString("en-US", { style: "currency", currency: "USD" }),
			row.booking.status,
			`${row.booking.customerName} | ${row.booking.customerEmail} | ${row.booking.customerPhone}`,
			row.bookedTickets.join(", "),
			new Date(row.booking.createdAt).toLocaleString(),
		])

		downloadExcel({
			fileName: `${event.name}-Bookings-Export`,
			sheet: "Bookings",
			tablePayload: {
				header: exportTableHeaders,
				body: exportTableData,
			},
		})
	}

	// Pagination
	const paginatedBookings = useMemo(() => {
		const startIndex = (currentPage - 1) * itemsPerPage
		const endIndex = startIndex + itemsPerPage
		return bookings.slice(startIndex, endIndex)
	}, [bookings, currentPage])

	const totalPages = Math.ceil(bookings.length / itemsPerPage)

	const getStatusColor = (status: string) => {
		switch (status) {
			case "confirmed":
			case "approved":
				return "green"
			case "pending":
				return "yellow"
			case "cancelled":
				return "red"
			case "refunded":
				return "gray"
			default:
				return "gray"
		}
	}

	return (
		<>
			<Head>
				<title>{event.name} - Bookings - Jetzy Events</title>
				<meta name="description" content={`View and manage bookings for ${event.name}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Bookings} bg="#F0F2F5">
				<Box maxW="1400px" mx="auto" px={{ base: 4, sm: 6 }} py={8}>
					{/* Header Section */}
					<Flex direction={{ base: "column", sm: "row" }} justify="space-between" align={{ base: "start", sm: "center" }} gap={4} mb={8}>
						<Flex align="center" gap={4}>
							<Link href="/console/bookings">
								<IconButton
									aria-label="Back"
									icon={<ChevronLeftIcon className="w-5 h-5" />}
									variant="outline"
									isRound
									bg="white"
									_hover={{ bg: "gray.50" }}
								/>
							</Link>
							<Box>
								<Text fontSize="2xl" fontWeight="bold" color="gray.900">{event.name}</Text>
								<Flex align="center" gap={4} fontSize="sm" color="gray.500" mt={1}>
									<Flex align="center" gap={1}>
										<CalendarIcon className="w-4 h-4" />
										<Text>{new Date(event.startsOn).toLocaleDateString()}</Text>
									</Flex>
									{event.location && (
										<Flex align="center" gap={1}>
											<MapPinIcon className="w-4 h-4" />
											<Text noOfLines={1} maxW="300px">{event.location}</Text>
										</Flex>
									)}
								</Flex>
							</Box>
						</Flex>
						<Button
							leftIcon={<ArrowDownTrayIcon className="w-4 h-4" />}
							onClick={handleExport}
							bg="white"
							variant="outline"
							_hover={{ bg: "gray.50" }}
						>
							Export CSV
						</Button>
					</Flex>

					{/* Stats Cards */}
					<SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={4} mb={8}>
						<Box bg="white" p={6} borderRadius="xl" shadow="sm" border="1px" borderColor="gray.200">
							<Flex justify="space-between" align="start">
								<Box>
									<Text fontSize="sm" fontWeight="medium" color="gray.500" mb={1}>Total Revenue</Text>
									<Text fontSize="2xl" fontWeight="bold" color="gray.900">
										{statistics.totalRevenue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
									</Text>
								</Box>
								<Box p={3} bg="green.50" color="green.600" borderRadius="lg">
									<CurrencyDollarIcon className="w-6 h-6" />
								</Box>
							</Flex>
						</Box>
						
						<Box bg="white" p={6} borderRadius="xl" shadow="sm" border="1px" borderColor="gray.200">
							<Flex justify="space-between" align="start">
								<Box>
									<Text fontSize="sm" fontWeight="medium" color="gray.500" mb={1}>Active Tickets</Text>
									<Text fontSize="2xl" fontWeight="bold" color="gray.900">{statistics.activeTickets}</Text>
								</Box>
								<Box p={3} bg="blue.50" color="blue.600" borderRadius="lg">
									<TicketIcon className="w-6 h-6" />
								</Box>
							</Flex>
						</Box>

						<Box bg="white" p={6} borderRadius="xl" shadow="sm" border="1px" borderColor="gray.200">
							<Flex justify="space-between" align="start">
								<Box>
									<Text fontSize="sm" fontWeight="medium" color="gray.500" mb={1}>Active Customers</Text>
									<Text fontSize="2xl" fontWeight="bold" color="gray.900">{statistics.activeCustomers}</Text>
								</Box>
								<Box p={3} bg="purple.50" color="purple.600" borderRadius="lg">
									<UserIcon className="w-6 h-6" />
								</Box>
							</Flex>
						</Box>

						<Box bg="white" p={6} borderRadius="xl" shadow="sm" border="1px" borderColor="gray.200">
							<Flex justify="space-between" align="start">
								<Box>
									<Text fontSize="sm" fontWeight="medium" color="gray.500" mb={1}>Cancelled</Text>
									<Text fontSize="2xl" fontWeight="bold" color="gray.900">{statistics.canceledTickets}</Text>
								</Box>
								<Box p={3} bg="red.50" color="red.600" borderRadius="lg">
									<XCircleIcon className="w-6 h-6" />
								</Box>
							</Flex>
						</Box>
					</SimpleGrid>

					{/* Main Content Area */}
					<Box bg="white" borderRadius="xl" shadow="sm" border="1px" borderColor="gray.200" overflow="hidden">
						{/* Tabs */}
						<Flex borderBottom="1px" borderColor="gray.200">
							<Button
								variant="ghost"
								onClick={() => setActiveTab("bookings")}
								borderRadius="0"
								borderBottom={activeTab === "bookings" ? "2px solid" : "2px solid transparent"}
								borderColor={activeTab === "bookings" ? "purple.500" : "transparent"}
								color={activeTab === "bookings" ? "purple.600" : "gray.500"}
								_hover={{ bg: "gray.50" }}
								px={6}
								py={6}
							>
								Bookings
							</Button>
							<Button
								variant="ghost"
								onClick={() => setActiveTab("waiting-list")}
								borderRadius="0"
								borderBottom={activeTab === "waiting-list" ? "2px solid" : "2px solid transparent"}
								borderColor={activeTab === "waiting-list" ? "purple.500" : "transparent"}
								color={activeTab === "waiting-list" ? "purple.600" : "gray.500"}
								_hover={{ bg: "gray.50" }}
								px={6}
								py={6}
							>
								Waiting List
							</Button>
						</Flex>

						{/* Filters */}
						<Box p={4} bg="gray.50" borderBottom="1px" borderColor="gray.200">
							<Flex direction={{ base: "column", md: "row" }} gap={4}>
								<Box position="relative" flex="1">
									<Box position="absolute" left="3" top="50%" transform="translateY(-50%)" color="gray.400">
										<MagnifyingGlassIcon className="w-5 h-5" />
									</Box>
									<Input
										placeholder="Search by name, email or phone..."
										defaultValue={filters.search}
										pl="10"
										bg="white"
										onChange={(e) => setCurrentFilters({ ...currentFilters, search: e.target.value })}
									/>
								</Box>
								
								<Flex gap={2} overflowX="auto" pb={{ base: 2, md: 0 }}>
									<Select
										bg="white"
										w="150px"
										placeholder="All Status"
										defaultValue={filters.status}
										onChange={(e) => setCurrentFilters({ ...currentFilters, status: e.target.value })}
									>
										<option value="confirmed">Confirmed</option>
										<option value="pending">Pending</option>
										<option value="cancelled">Cancelled</option>
									</Select>

									<Input
										type="date"
										bg="white"
										w="auto"
										defaultValue={filters.date}
										onChange={(e) => setCurrentFilters({ ...currentFilters, date: e.target.value })}
									/>

									<Button
										colorScheme="purple"
										px={6}
										onClick={() => {
											const params = new URLSearchParams()
											if (currentFilters.status) params.set("status", currentFilters.status)
											if (currentFilters.search) params.set("search", currentFilters.search.trim())
											if (currentFilters.date) params.set("date", currentFilters.date)
											window.location.href = `/console/bookings/${event._id}?${params.toString()}`
										}}
									>
										Apply
									</Button>
								</Flex>
							</Flex>
						</Box>

						{/* Content */}
						<Box overflowX="auto">
							{activeTab === "bookings" && (
								<>
									{paginatedBookings.length === 0 ? (
										<Flex direction="column" align="center" justify="center" py={16}>
											<Box p={4} bg="gray.100" borderRadius="full" mb={4}>
												<TicketIcon className="w-8 h-8 text-gray-400" />
											</Box>
											<Text fontSize="lg" fontWeight="medium" color="gray.900" mb={1}>No Bookings Found</Text>
											<Text fontSize="sm" color="gray.500">Try adjusting your search or filters.</Text>
										</Flex>
									) : (
										<Table variant="simple">
											<Thead bg="gray.50">
												<Tr>
													<Th>Reference</Th>
													<Th>Customer</Th>
													<Th>Tickets</Th>
													<Th>Total</Th>
													<Th>Status</Th>
													<Th>Date</Th>
													<Th></Th>
												</Tr>
											</Thead>
											<Tbody>
												{paginatedBookings.map((booking) => (
													<Tr key={booking._id} _hover={{ bg: "gray.50" }}>
														<Td fontSize="sm" fontFamily="mono" color="gray.500">
															{booking.bookingRef}
														</Td>
														<Td>
															<Flex align="center" gap={3}>
																<Avatar size="sm" name={booking.customerName} />
																<Box>
																	<Text fontWeight="medium" color="gray.900">{booking.customerName}</Text>
																	<Text fontSize="xs" color="gray.500">{booking.customerEmail}</Text>
																</Box>
															</Flex>
														</Td>
														<Td>
															<Flex direction="column" gap={1}>
																{booking.tickets.map((t, idx) => (
																	<Badge key={idx} variant="subtle" colorScheme="gray" fontSize="xs" w="fit-content">
																		{t.quantity}x Ticket
																	</Badge>
																))}
															</Flex>
														</Td>
														<Td fontWeight="medium">
															${booking.total.toFixed(2)}
														</Td>
														<Td>
															<Badge colorScheme={getStatusColor(booking.status)} borderRadius="full" px={2} py={0.5} textTransform="capitalize">
																{booking.status}
															</Badge>
														</Td>
														<Td fontSize="sm" color="gray.600">
															<Text>{new Date(booking.createdAt).toLocaleDateString()}</Text>
															<Text fontSize="xs" color="gray.400">{new Date(booking.createdAt).toLocaleTimeString()}</Text>
														</Td>
														<Td>
															<Menu>
																<MenuButton as={IconButton} icon={<EllipsisHorizontalIcon className="w-5 h-5" />} variant="ghost" size="sm" />
																<MenuList>
																	<MenuItem>View Details</MenuItem>
																	<MenuItem>Resend Receipt</MenuItem>
																	<MenuItem color="red.500">Cancel Booking</MenuItem>
																</MenuList>
															</Menu>
														</Td>
													</Tr>
												))}
											</Tbody>
										</Table>
									)}
								</>
							)}

							{activeTab === "waiting-list" && (
								<Flex direction="column" align="center" justify="center" py={16}>
									<Box p={4} bg="gray.100" borderRadius="full" mb={4}>
										<ClockIcon className="w-8 h-8 text-gray-400" />
									</Box>
									<Text fontSize="lg" fontWeight="medium" color="gray.900" mb={1}>Waiting List</Text>
									<Text fontSize="sm" color="gray.500">Waiting list management coming soon.</Text>
								</Flex>
							)}
						</Box>

						{/* Pagination Footer */}
						{activeTab === "bookings" && totalPages > 1 && (
							<Flex px={6} py={4} bg="gray.50" borderTop="1px" borderColor="gray.200" justify="space-between" align="center">
								<Text fontSize="sm" color="gray.500">
									Page <Text as="span" fontWeight="medium">{currentPage}</Text> of <Text as="span" fontWeight="medium">{totalPages}</Text>
								</Text>
								<Flex gap={2}>
									<Button
										onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
										isDisabled={currentPage === 1}
										size="sm"
										variant="outline"
										bg="white"
									>
										Previous
									</Button>
									<Button
										onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
										isDisabled={currentPage === totalPages}
										size="sm"
										variant="outline"
										bg="white"
									>
										Next
									</Button>
								</Flex>
							</Flex>
						)}
					</Box>
				</Box>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
	const sessionResult = await adminOnly(ctx)
	if (!sessionResult || "redirect" in sessionResult) return sessionResult
	const session = sessionResult.props.session

	const { eventId } = ctx.params as { eventId: string }
	const { status, date, search, amount, minTickets } = ctx.query

	// Get the event doc
	const eventDoc = await Events.findById(eventId, {
		_id: 1,
		name: 1,
		startsOn: 1,
		endsOn: 1,
		location: 1
	}).lean()

	if (!eventDoc) return { notFound: true }

	const filter: any = { eventId }

	if (status && typeof status === "string") filter.status = status

	if (date && typeof date === "string") {
		const selectedDate = new Date(date)
		const startOfDay = new Date(selectedDate)
		startOfDay.setUTCHours(0, 0, 0, 0)
		const endOfDay = new Date(selectedDate)

		endOfDay.setUTCHours(23, 59, 59, 999)
		filter.createdAt = { $gte: startOfDay, $lte: endOfDay }
	}

	if (search && typeof search === "string") {
		filter.$or = [{ customerName: { $regex: search, $options: "i" } }, { customerEmail: { $regex: search, $options: "i" } }]
	}
	if (amount && !isNaN(Number(amount))) {
		filter.total = { $gte: Number(amount) }
	}

	if (minTickets && !isNaN(Number(minTickets))) {
		filter["tickets.quantity"] = { $gte: Number(minTickets) }
	}

	// query db
	const bookings = await Bookings.find(filter, {
		bookingRef: 1,
		eventId: 1,
		tickets: 1,
		status: 1,
		customerName: 1,
		customerEmail: 1,
		customerPhone: 1,
		total: 1,
		createdAt: 1,
	})
		.sort({ createdAt: -1 })
		.lean()
		.exec()

	//exportable data for excel
	const exportable = await Promise.all(
		bookings.map(async (b) => {
			const event = eventDoc

			//get ticket summary
			const bookedTickets = b.tickets.map((t: any) => {
				return `Ticket ${t.ticketId.toString()} x ${t.quantity}`
			})

			return {
				booking: {
					...b,
					_id: b._id.toString(),
					eventId: b.eventId.toString(),
					createdAt: b.createdAt ? b.createdAt.toString() : "",
					tickets: bookedTickets,
				},
				event: {
					...event,
					name: event.name,
					_id: event._id.toString(),
					startsOn: event.startsOn.toISOString(),
					endsOn: event.endsOn.toISOString(),
				},
				bookedTickets,
			}
		}),
	)

	return {
		props: {
			event: {
				...eventDoc,
				_id: eventDoc._id.toString(),
				startsOn: eventDoc.startsOn.toISOString(),
				endsOn: eventDoc.endsOn.toISOString(),
			},
			bookings: bookings.map((b) => ({
				...b,
				_id: b._id.toString(),
				eventId: b.eventId.toString(),
				createdAt: b.createdAt ? b.createdAt.toString() : "",
				tickets: b.tickets.map((t: any) => ({
					ticketId: t.ticketId.toString(),
					quantity: t.quantity,
				})),
			})),
			exportable,
			filters: {
				status: (status as string) || "",
				date: (date as string) || "",
				search: (search as string) || "",
				amount: (amount as string) || "",
				minTickets: (minTickets as string) || "",
			},
		},
	}
}
