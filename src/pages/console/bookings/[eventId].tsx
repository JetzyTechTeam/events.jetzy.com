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
import axios from "axios"
import { useRouter } from "next/router"
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
	SimpleGrid,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalFooter,
	ModalCloseButton,
	useToast,
	useDisclosure,
	Divider,
	Stack,
	Heading,
	Spinner
} from "@chakra-ui/react"

type Props = {
	bookings: Booking[]
	event: { _id: string; name: string; startsOn: string; endsOn: string; location?: string }
	filters: { status?: string; search?: string; date?: string; amount?: string; minTickets?: string }
	exportable: any[]
}

export default function BookingsEventPage({ bookings, event, filters, exportable }: Props) {
	const router = useRouter()
	const toast = useToast()
	const { isOpen: isDetailsOpen, onOpen: onDetailsOpen, onClose: onDetailsClose } = useDisclosure()
	const { isOpen: isCancelOpen, onOpen: onCancelOpen, onClose: onCancelClose } = useDisclosure()
	const { isOpen: isResendOpen, onOpen: onResendOpen, onClose: onResendClose } = useDisclosure()
	
	const handleDetailsClose = () => {
		setInvitedGuests([])
		setSelectedBooking(null)
		onDetailsClose()
	}
	const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
	const [isCancelling, setIsCancelling] = useState(false)
	const [isResending, setIsResending] = useState(false)
	const [eventDetails, setEventDetails] = useState<any>(null)
	const [invitedGuests, setInvitedGuests] = useState<any[]>([])
	const [loadingGuests, setLoadingGuests] = useState(false)
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
		switch (status.toLowerCase()) {
			case "confirmed":
			case "approved":
				return "green"
			case "pending":
				return "yellow"
			case "cancelled":
			case "failed":
				return "red"
			case "refunded":
				return "gray"
			default:
				return "gray"
		}
	}

	const handleViewDetails = async (booking: Booking) => {
		setSelectedBooking(booking)
		onDetailsOpen()
		
		// Fetch event details if not already loaded
		if (!eventDetails) {
			try {
				const response = await axios.get(`/api/events/${event._id}`)
				if (response.data.status) {
					setEventDetails(response.data.data)
				}
			} catch (error) {
				console.error("Error fetching event details:", error)
				toast({
					title: "Warning",
					description: "Could not load full event details, but booking information is available.",
					status: "warning",
					duration: 3000,
					isClosable: true,
				})
			}
		}

		// Fetch invited guests for this booking
		setLoadingGuests(true)
		try {
			const response = await axios.get(`/api/bookings/${booking._id}/invited-guests`)
			if (response.data.status) {
				setInvitedGuests(response.data.data || [])
			}
		} catch (error) {
			console.error("Error fetching invited guests:", error)
			setInvitedGuests([])
		} finally {
			setLoadingGuests(false)
		}
	}

	const handleCancelBooking = async () => {
		if (!selectedBooking) return

		setIsCancelling(true)
		try {
			const response = await axios.post(`/api/bookings/${selectedBooking._id}/cancel`)
			if (response.data.status) {
				toast({
					title: "Success",
					description: "Booking cancelled successfully",
					status: "success",
					duration: 3000,
					isClosable: true,
				})
				onCancelClose()
				setSelectedBooking(null)
				// Refresh the page to show updated data
				router.reload()
			} else {
				throw new Error(response.data.message || "Failed to cancel booking")
			}
		} catch (error: any) {
			toast({
				title: "Error",
				description: error.response?.data?.message || error.message || "Failed to cancel booking",
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		} finally {
			setIsCancelling(false)
		}
	}

	const handleResendReceipt = (booking: Booking) => {
		setSelectedBooking(booking)
		onResendOpen()
	}

	const confirmResendReceipt = async () => {
		if (!selectedBooking) return

		setIsResending(true)
		try {
			const response = await axios.post(`/api/bookings/${selectedBooking._id}/resend-receipt`)
			if (response.data.status) {
				toast({
					title: "Success",
					description: `Receipt sent successfully to ${selectedBooking.customerEmail}`,
					status: "success",
					duration: 3000,
					isClosable: true,
				})
				onResendClose()
				setSelectedBooking(null)
			} else {
				throw new Error(response.data.message || "Failed to resend receipt")
			}
		} catch (error: any) {
			toast({
				title: "Error",
				description: error.response?.data?.message || error.message || "Failed to resend receipt",
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		} finally {
			setIsResending(false)
		}
	}

	return (
		<>
			<Head>
				<title>{event.name} - Bookings - Jetzy Events</title>
				<meta name="description" content={`View and manage bookings for ${event.name}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Bookings}>
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
																	<MenuItem onClick={() => handleViewDetails(booking)}>View Details</MenuItem>
																	{booking.status === "pending" && (
																		<MenuItem onClick={async () => {
																			try {
																				let paymentUrl = booking.paymentUrl
																				
																				// If paymentUrl is not available but stripeSessionId exists, fetch it
																				if (!paymentUrl && booking.stripeSessionId) {
																					toast({
																						title: "Fetching payment link...",
																						status: "info",
																						duration: 2000,
																						isClosable: true,
																					})
																					const response = await axios.get(`/api/bookings/payment-url?sessionId=${booking.stripeSessionId}`)
																					paymentUrl = response.data?.data?.paymentUrl
																				}
																				
																				if (!paymentUrl) {
																					// Try to get payment URL from booking reference
																					try {
																						const response = await axios.get(`/api/bookings/payment-url-by-booking?bookingRef=${booking.bookingRef}`)
																						if (response.data?.data?.paymentUrl) {
																							paymentUrl = response.data.data.paymentUrl
																						}
																					} catch (fallbackError: any) {
																						// Silently handle 404 or other errors - don't log to console
																						if (fallbackError?.response?.status !== 404) {
																							console.log("[ConsoleBookings] Could not retrieve payment URL from booking reference:", fallbackError?.response?.status || fallbackError?.message)
																						}
																					}
																				}
																				
																				if (!paymentUrl) {
																					throw new Error("Payment link is not available for this booking. The payment session may have expired or the booking was created through a different method.")
																				}
																				
																				await navigator.clipboard.writeText(paymentUrl)
																				toast({
																					title: "Payment link copied!",
																					status: "success",
																					duration: 2000,
																					isClosable: true,
																				})
																			} catch (error: any) {
																				// Only log non-user-facing errors
																				if (error?.response?.status !== 404 && !error?.message?.includes("Payment link is not available")) {
																					console.error("Error copying payment link:", error)
																				}
																				
																				// Show user-friendly error message
																				const errorMessage = error?.response?.data?.message || error?.message || "Could not retrieve payment link"
																				toast({
																					title: "Payment Link Unavailable",
																					description: errorMessage,
																					status: "warning",
																					duration: 5000,
																					isClosable: true,
																				})
																			}
																		}}>
																			Copy Payment Link
																		</MenuItem>
																	)}
																	<MenuItem 
																		onClick={() => handleResendReceipt(booking)}
																		isDisabled={booking.status === "cancelled"}
																	>
																		Resend Receipt
																	</MenuItem>
																	<MenuItem 
																		color="red.500" 
																		onClick={() => {
																			setSelectedBooking(booking)
																			onCancelOpen()
																		}}
																		isDisabled={booking.status === "cancelled"}
																	>
																		Cancel Booking
																	</MenuItem>
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

				{/* View Details Modal */}
				<Modal isOpen={isDetailsOpen} onClose={handleDetailsClose} size="xl">
					<ModalOverlay />
					<ModalContent>
						<ModalHeader>Booking Details</ModalHeader>
						<ModalCloseButton />
						<ModalBody>
							{selectedBooking ? (
								<Stack spacing={4}>
									<Box>
										<Heading size="sm" mb={3}>Customer Information</Heading>
										<Stack spacing={2}>
											<Flex justify="space-between">
												<Text fontWeight="semibold">Name:</Text>
												<Text>{selectedBooking.customerName}</Text>
											</Flex>
											<Flex justify="space-between">
												<Text fontWeight="semibold">Email:</Text>
												<Text>{selectedBooking.customerEmail}</Text>
											</Flex>
											<Flex justify="space-between">
												<Text fontWeight="semibold">Phone:</Text>
												<Text>{selectedBooking.customerPhone}</Text>
											</Flex>
										</Stack>
									</Box>

									<Divider />

									<Box>
										<Heading size="sm" mb={3}>Booking Information</Heading>
										<Stack spacing={2}>
											<Flex justify="space-between">
												<Text fontWeight="semibold">Booking Reference:</Text>
												<Text fontFamily="mono" fontSize="sm">{selectedBooking.bookingRef}</Text>
											</Flex>
											<Flex justify="space-between">
												<Text fontWeight="semibold">Status:</Text>
												<Badge colorScheme={getStatusColor(selectedBooking.status)}>
													{selectedBooking.status}
												</Badge>
											</Flex>
											{selectedBooking.status === "pending" && selectedBooking.paymentUrl && (
												<Flex justify="space-between" align="center">
													<Text fontWeight="semibold">Payment Link:</Text>
													<Flex align="center" gap={2}>
														<Text fontSize="xs" fontFamily="mono" color="gray.600" maxW="200px" isTruncated>
															{selectedBooking.paymentUrl}
														</Text>
														<Button
															size="xs"
															colorScheme="blue"
															onClick={async () => {
																try {
																	await navigator.clipboard.writeText(selectedBooking.paymentUrl!)
																	toast({
																		title: "Payment link copied!",
																		status: "success",
																		duration: 2000,
																		isClosable: true,
																	})
																} catch (error) {
																	toast({
																		title: "Failed to copy",
																		status: "error",
																		duration: 2000,
																		isClosable: true,
																	})
																}
															}}
														>
															Copy
														</Button>
													</Flex>
												</Flex>
											)}
											<Flex justify="space-between">
												<Text fontWeight="semibold">Booking Date:</Text>
												<Text>{new Date(selectedBooking.createdAt).toLocaleString()}</Text>
											</Flex>
										</Stack>
									</Box>

									<Divider />

									<Box>
										<Heading size="sm" mb={3}>Event Information</Heading>
										<Stack spacing={2}>
											<Flex justify="space-between">
												<Text fontWeight="semibold">Event Name:</Text>
												<Text>{event.name}</Text>
											</Flex>
											{event.location && (
												<Flex justify="space-between">
													<Text fontWeight="semibold">Location:</Text>
													<Text>{event.location}</Text>
												</Flex>
											)}
											<Flex justify="space-between">
												<Text fontWeight="semibold">Date:</Text>
												<Text>{new Date(event.startsOn).toLocaleDateString()}</Text>
											</Flex>
										</Stack>
									</Box>

									<Divider />

									<Box>
										<Heading size="sm" mb={3}>Ticket Details</Heading>
										<Stack spacing={2}>
											{selectedBooking.tickets.map((ticket, idx) => (
												<Box key={idx} p={3} bg="gray.50" borderRadius="md">
													<Flex justify="space-between" mb={1}>
														<Text fontWeight="semibold">Ticket {idx + 1}</Text>
														<Text>Qty: {ticket.quantity}</Text>
													</Flex>
													<Text fontSize="sm" color="gray.600">
														Ticket ID: {ticket.ticketId.toString().substring(0, 8)}...
													</Text>
												</Box>
											))}
										</Stack>
									</Box>

									<Divider />

									<Box>
										<Heading size="sm" mb={3}>Payment Summary</Heading>
										<Stack spacing={2}>
											<Flex justify="space-between">
												<Text fontWeight="semibold">Total:</Text>
												<Text fontWeight="bold" fontSize="lg">${selectedBooking.total.toFixed(2)}</Text>
											</Flex>
										</Stack>
									</Box>

									{/* Invited Guests Section */}
									{(loadingGuests || invitedGuests.length > 0) && (
										<>
											<Divider />
											<Box>
												<Heading size="sm" mb={3}>Invited Guests</Heading>
												{loadingGuests ? (
													<Flex justify="center" align="center" py={4}>
														<Spinner size="sm" />
														<Text ml={3} fontSize="sm" color="gray.500">Loading guests...</Text>
													</Flex>
												) : invitedGuests.length > 0 ? (
													<Stack spacing={2}>
														{invitedGuests.map((guest, idx) => (
															<Text key={idx} fontSize="sm" color="gray.700">
																{guest.email}
															</Text>
														))}
													</Stack>
												) : (
													<Text fontSize="sm" color="gray.500" fontStyle="italic">No invited guests for this booking</Text>
												)}
											</Box>
										</>
									)}
								</Stack>
							) : (
								<Text>No booking selected</Text>
							)}
						</ModalBody>
						<ModalFooter>
							<Button onClick={handleDetailsClose}>Close</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>

				{/* Cancel Booking Confirmation Modal */}
				<Modal isOpen={isCancelOpen} onClose={onCancelClose}>
					<ModalOverlay />
					<ModalContent>
						<ModalHeader>Cancel Booking</ModalHeader>
						<ModalCloseButton />
						<ModalBody>
							<Text mb={4}>
								Are you sure you want to cancel this booking? This action cannot be undone and will free up the tickets.
							</Text>
							{selectedBooking && (
								<Box p={3} bg="gray.50" borderRadius="md">
									<Text fontSize="sm"><strong>Booking:</strong> {selectedBooking.bookingRef}</Text>
									<Text fontSize="sm"><strong>Customer:</strong> {selectedBooking.customerName}</Text>
									<Text fontSize="sm"><strong>Amount:</strong> ${selectedBooking.total.toFixed(2)}</Text>
								</Box>
							)}
						</ModalBody>
						<ModalFooter>
							<Button variant="ghost" mr={3} onClick={onCancelClose} isDisabled={isCancelling}>
								No, Keep Booking
							</Button>
							<Button colorScheme="red" onClick={handleCancelBooking} isLoading={isCancelling}>
								Yes, Cancel Booking
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>

				{/* Resend Receipt Confirmation Modal */}
				<Modal isOpen={isResendOpen} onClose={onResendClose}>
					<ModalOverlay />
					<ModalContent>
						<ModalHeader>Resend Receipt</ModalHeader>
						<ModalCloseButton />
						<ModalBody>
							<Text mb={4}>
								Are you sure you want to resend the receipt email to this customer?
							</Text>
							{selectedBooking && (
								<Box p={3} bg="gray.50" borderRadius="md">
									<Text fontSize="sm"><strong>Booking:</strong> {selectedBooking.bookingRef}</Text>
									<Text fontSize="sm"><strong>Customer:</strong> {selectedBooking.customerName}</Text>
									<Text fontSize="sm"><strong>Email:</strong> {selectedBooking.customerEmail}</Text>
									<Text fontSize="sm"><strong>Amount:</strong> ${selectedBooking.total.toFixed(2)}</Text>
								</Box>
							)}
						</ModalBody>
						<ModalFooter>
							<Button variant="ghost" mr={3} onClick={onResendClose} isDisabled={isResending}>
								Cancel
							</Button>
							<Button colorScheme="blue" onClick={confirmResendReceipt} isLoading={isResending}>
								{isResending ? "Sending..." : "Yes, Send Receipt"}
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
	const sessionResult = await adminOnly(ctx)
	if (!sessionResult || "redirect" in sessionResult) return sessionResult as any
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
		stripeSessionId: 1,
	})
		.sort({ createdAt: -1 })
		.lean()
		.exec()

	// For pending bookings with stripeSessionId, retrieve the payment URL from Stripe
	const { default: Stripe } = await import('stripe')
	const stripe = new Stripe(process.env.NEXT_STRIPE_SECRET_KEY as string)
	
		const bookingsWithPaymentUrl = await Promise.all(
		bookings.map(async (booking: any) => {
			if (booking.status === 'pending' && booking.stripeSessionId) {
				try {
					const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId)
					
					console.log(`[bookings/[eventId]] Session details for booking ${booking._id}:`, {
						id: session.id,
						payment_status: session.payment_status,
						status: session.status,
						expires_at: session.expires_at,
						expires_at_date: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
						hasUrl: !!session.url,
						url: session.url
					})
					
					// Check if session has expired
					if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000)) {
						console.log(`[bookings/[eventId]] Session expired for booking ${booking._id}`)
						return {
							...booking,
							paymentUrl: null,
						}
					}
					
					// Check if session is already completed
					if (session.payment_status === 'paid' || session.status === 'complete') {
						console.log(`[bookings/[eventId]] Session already completed for booking ${booking._id}`)
						return {
							...booking,
							paymentUrl: null,
						}
					}
					
					return {
						...booking,
						paymentUrl: session.url || null,
					}
				} catch (error: any) {
					console.error(`[bookings/[eventId]] Error retrieving Stripe session for booking ${booking._id}:`, {
						message: error.message,
						code: error.code,
						type: error.type
					})
					return {
						...booking,
						paymentUrl: null,
					}
				}
			}
			return booking
		})
	)

	//exportable data for excel
	const exportable = await Promise.all(
		bookingsWithPaymentUrl.map(async (b) => {
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
			bookings: bookingsWithPaymentUrl.map((b) => ({
				...b,
				_id: b._id.toString(),
				eventId: b.eventId.toString(),
				createdAt: b.createdAt ? b.createdAt.toString() : "",
				tickets: b.tickets.map((t: any) => ({
					ticketId: t.ticketId.toString(),
					quantity: t.quantity,
				})),
				paymentUrl: b.paymentUrl || null,
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
