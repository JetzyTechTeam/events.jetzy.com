import React, { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { 
	Table, 
	Thead, 
	Tbody, 
	Tr, 
	Th, 
	Td, 
	Badge, 
	Box, 
	Text, 
	Spinner, 
	Avatar,
	Flex,
	IconButton,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
	Input,
	InputGroup,
	InputLeftElement,
	Select
} from "@chakra-ui/react"
import { 
	MagnifyingGlassIcon, 
	EllipsisHorizontalIcon,
	FunnelIcon,
	ArrowDownTrayIcon
} from "@heroicons/react/24/outline"

interface TicketInfo {
	ticketId: string
	quantity: number
	_id: string
}

interface Booking {
	_id: string
	bookingRef: string
	tickets: TicketInfo[]
	status: string
	customerName: string
	customerEmail: string
	customerPhone: string
	subTotal: number
	tax: number
	total: number
	createdAt: string
}

function EventBookings({ eventId }: { eventId: string }) {
	const { data: bookings, isLoading } = useQuery({
		queryKey: ["eventBookings", eventId],
		queryFn: () => axios.get(`/api/events/${eventId}/event-bookings`),
	})

	const { data: totals, isLoading: totalsLoading } = useQuery({
		queryKey: ["eventTotals", eventId],
		queryFn: () => axios.get(`/api/events/${eventId}/totals`),
	})

	const { totalTickets, uniqueCustomers, cancelledTickets, cancelledGuests } = useMemo(() => {
		if (!totals?.data) return { totalTickets: 0, uniqueCustomers: 0, cancelledTickets: 0, cancelledGuests: 0 }

		return {
			totalTickets: totals.data.totalTickets || 0,
			uniqueCustomers: totals.data.uniqueGuests || 0,
			cancelledTickets: totals.data.cancelledTickets || 0,
			cancelledGuests: totals.data.cancelledGuests || 0,
		}
	}, [totals?.data])

	if (isLoading) {
		return (
			<Flex justify="center" align="center" py={12}>
				<Spinner size="xl" color="blue.500" thickness="3px" />
			</Flex>
		)
	}

	return (
		<Box>
			{/* Stats Cards */}
			<Flex gap={4} mb={6} wrap="wrap">
				<Box bg="white" p={4} borderRadius="lg" border="1px solid" borderColor="gray.200" flex="1" minW="200px" boxShadow="sm">
					<Text fontSize="sm" color="gray.500" fontWeight="medium" mb={1}>Total Active Tickets</Text>
					<Text fontSize="2xl" fontWeight="bold" color="gray.800">{totalTickets}</Text>
				</Box>
				<Box bg="white" p={4} borderRadius="lg" border="1px solid" borderColor="gray.200" flex="1" minW="200px" boxShadow="sm">
					<Text fontSize="sm" color="gray.500" fontWeight="medium" mb={1}>Total Customers</Text>
					<Text fontSize="2xl" fontWeight="bold" color="gray.800">{uniqueCustomers}</Text>
				</Box>
				<Box bg="white" p={4} borderRadius="lg" border="1px solid" borderColor="gray.200" flex="1" minW="200px" boxShadow="sm">
					<Text fontSize="sm" color="gray.500" fontWeight="medium" mb={1}>Cancelled Tickets</Text>
					<Text fontSize="2xl" fontWeight="bold" color="red.500">{cancelledTickets}</Text>
				</Box>
			</Flex>

			{/* Filters & Search */}
			<Flex justify="space-between" align="center" mb={6} gap={4} wrap="wrap">
				<InputGroup maxW="300px" size="sm">
					<InputLeftElement pointerEvents="none">
						<MagnifyingGlassIcon style={{ width: 16, height: 16, color: '#9CA3AF' }} />
					</InputLeftElement>
					<Input placeholder="Search bookings..." borderRadius="md" bg="white" />
				</InputGroup>
				
				<Flex gap={2}>
					<Select placeholder="Status" size="sm" borderRadius="md" bg="white" maxW="150px" icon={<FunnelIcon style={{ width: 14, height: 14 }} />}>
						<option value="confirmed">Confirmed</option>
						<option value="pending">Pending</option>
						<option value="cancelled">Cancelled</option>
					</Select>
					<IconButton
						aria-label="Export"
						icon={<ArrowDownTrayIcon style={{ width: 16, height: 16 }} />}
						size="sm"
						variant="outline"
						bg="white"
					/>
				</Flex>
			</Flex>

			{/* Bookings Table */}
			<Box bg="white" borderRadius="lg" border="1px solid" borderColor="gray.200" overflow="hidden" boxShadow="sm">
				<Box overflowX="auto">
					<Table variant="simple">
						<Thead bg="gray.50">
							<Tr>
								<Th textTransform="uppercase" fontSize="xs" color="gray.500" fontWeight="bold" py={4}>Customer</Th>
								<Th textTransform="uppercase" fontSize="xs" color="gray.500" fontWeight="bold" py={4}>Booking Ref</Th>
								<Th textTransform="uppercase" fontSize="xs" color="gray.500" fontWeight="bold" py={4}>Date</Th>
								<Th textTransform="uppercase" fontSize="xs" color="gray.500" fontWeight="bold" py={4}>Tickets</Th>
								<Th textTransform="uppercase" fontSize="xs" color="gray.500" fontWeight="bold" py={4}>Amount</Th>
								<Th textTransform="uppercase" fontSize="xs" color="gray.500" fontWeight="bold" py={4}>Status</Th>
								<Th textTransform="uppercase" fontSize="xs" color="gray.500" fontWeight="bold" py={4} textAlign="right">Actions</Th>
							</Tr>
						</Thead>
						<Tbody>
							{!bookings?.data || bookings.data.length === 0 ? (
								<Tr>
									<Td colSpan={7} textAlign="center" py={8} color="gray.500">
										No bookings found.
									</Td>
								</Tr>
							) : (
								bookings.data.map((booking: Booking) => (
									<Tr key={booking._id} _hover={{ bg: "gray.50" }} transition="background 0.2s">
										<Td py={4}>
											<Flex align="center" gap={3}>
												<Avatar size="sm" name={booking.customerName} bg="blue.500" color="white" />
												<Box>
													<Text fontWeight="semibold" fontSize="sm" color="gray.900">{booking.customerName}</Text>
													<Text fontSize="xs" color="gray.500">{booking.customerEmail}</Text>
												</Box>
											</Flex>
										</Td>
										<Td py={4}>
											<Text fontSize="sm" fontFamily="mono" color="gray.600" bg="gray.100" px={2} py={1} borderRadius="md" w="fit">
												{booking.bookingRef}
											</Text>
										</Td>
										<Td py={4}>
											<Text fontSize="sm" color="gray.600">
												{new Date(booking.createdAt).toLocaleDateString()}
											</Text>
											<Text fontSize="xs" color="gray.400">
												{new Date(booking.createdAt).toLocaleTimeString()}
											</Text>
										</Td>
										<Td py={4}>
											<Flex direction="column" gap={1}>
												{booking.tickets.map((ticket, idx) => (
													<Text key={idx} fontSize="sm" color="gray.600">
														<span style={{ fontWeight: 600 }}>{ticket.quantity}x</span> Ticket
													</Text>
												))}
											</Flex>
										</Td>
										<Td py={4}>
											<Text fontWeight="semibold" fontSize="sm" color="gray.900">
												${booking.total.toFixed(2)}
											</Text>
										</Td>
										<Td py={4}>
											<Badge
												px={2}
												py={1}
												borderRadius="full"
												fontSize="xs"
												fontWeight="semibold"
												textTransform="capitalize"
												colorScheme={
													booking.status === "confirmed" || booking.status === "approved" ? "green" :
													booking.status === "pending" ? "yellow" : "red"
												}
											>
												{booking.status}
											</Badge>
										</Td>
										<Td py={4} textAlign="right">
											<Menu>
												<MenuButton
													as={IconButton}
													aria-label="Options"
													icon={<EllipsisHorizontalIcon style={{ width: 20, height: 20 }} />}
													variant="ghost"
													size="sm"
													color="gray.500"
												/>
												<MenuList fontSize="sm">
													<MenuItem>View Details</MenuItem>
													<MenuItem>Email Customer</MenuItem>
													<MenuItem color="red.500">Cancel Booking</MenuItem>
												</MenuList>
											</Menu>
										</Td>
									</Tr>
								))
							)}
						</Tbody>
					</Table>
				</Box>
			</Box>
		</Box>
	)
}

export { EventBookings }
