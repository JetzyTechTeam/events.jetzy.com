import React from "react"
import { IEvent } from "@/models/events/types"
import BookingEventCard from "./BookingEventCard"
import { useRouter } from "next/router"
import { Box, Flex, Text, Button, SimpleGrid, IconButton, Menu, MenuButton, MenuList, MenuItem } from "@chakra-ui/react"
import { ChevronLeftIcon, ChevronRightIcon, FunnelIcon, ArrowsUpDownIcon } from "@heroicons/react/24/outline"

type Pagination = {
	total: number
	page: number
	showing: number
	limit: number
	totalPages: number
}

type Props = {
	events: IEvent[]
	pagination: Pagination
}

const BookingEventsList: React.FC<Props> = ({ events, pagination }) => {
	const router = useRouter()

	const handlePrevPage = () => {
		if (pagination.page > 1) {
			router.push(`/console/bookings?page=${pagination.page - 1}`)
		}
	}

	const handleNextPage = () => {
		if (pagination.page < pagination.totalPages) {
			router.push(`/console/bookings?page=${pagination.page + 1}`)
		}
	}

	const goToPage = (page: number) => {
		router.push(`/console/bookings?page=${page}`)
	}

	// Generate page numbers to show
	const getPageNumbers = () => {
		const pages: (number | string)[] = []
		const { page, totalPages } = pagination

		if (totalPages <= 7) {
			for (let i = 1; i <= totalPages; i++) {
				pages.push(i)
			}
		} else {
			pages.push(1)
			if (page > 3) pages.push("...")
			for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
				pages.push(i)
			}
			if (page < totalPages - 2) pages.push("...")
			pages.push(totalPages)
		}
		return pages
	}

	return (
		<Box>
			{/* Toolbar */}
			<Flex justifyContent="space-between" alignItems="center" mb={6}>
				<Text fontSize="lg" fontWeight="bold" color="gray.700">
					Select an Event to View Bookings
				</Text>
				<Flex gap={2}>
					<Menu>
						<MenuButton as={Button} size="sm" variant="outline" rightIcon={<ChevronLeftIcon className="w-4 h-4 rotate-270" />} leftIcon={<ArrowsUpDownIcon className="w-4 h-4" />}>
							Sort By
						</MenuButton>
						<MenuList>
							<MenuItem>Newest First</MenuItem>
							<MenuItem>Oldest First</MenuItem>
							<MenuItem>Name (A-Z)</MenuItem>
						</MenuList>
					</Menu>
					<Button size="sm" variant="outline" leftIcon={<FunnelIcon className="w-4 h-4" />}>
						Filter
					</Button>
				</Flex>
			</Flex>

			{/* Grid Layout */}
			<SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing={6}>
				{events.map((event) => (
					<BookingEventCard key={event._id.toString()} event={event} />
				))}
			</SimpleGrid>

			{/* Pagination */}
			{pagination.totalPages > 1 && (
				<Flex 
					justifyContent="space-between" 
					alignItems="center" 
					mt={8} 
					pt={6} 
					borderTop="1px" 
					borderColor="gray.200"
					flexDirection={{ base: "column", sm: "row" }}
					gap={4}
				>
					<Text fontSize="sm" color="gray.500">
						Showing <Text as="span" fontWeight="semibold" color="gray.900">{pagination.showing}</Text> of <Text as="span" fontWeight="semibold" color="gray.900">{pagination.total}</Text> events
					</Text>

					<Flex gap={2} alignItems="center">
						<Button
							onClick={handlePrevPage}
							isDisabled={pagination.page === 1}
							size="sm"
							variant="outline"
							leftIcon={<ChevronLeftIcon className="w-4 h-4" />}
						>
							Previous
						</Button>

						<Flex display={{ base: "none", md: "flex" }} gap={1}>
							{getPageNumbers().map((pageNum, index) => (
								typeof pageNum === "number" ? (
									<Button
										key={index}
										onClick={() => goToPage(pageNum)}
										size="sm"
										variant={pageNum === pagination.page ? "solid" : "ghost"}
										colorScheme={pageNum === pagination.page ? "purple" : "gray"}
									>
										{pageNum}
									</Button>
								) : (
									<Text key={index} px={2} color="gray.400" alignSelf="center">...</Text>
								)
							))}
						</Flex>

						<Button
							onClick={handleNextPage}
							isDisabled={pagination.page === pagination.totalPages}
							size="sm"
							variant="outline"
							rightIcon={<ChevronRightIcon className="w-4 h-4" />}
						>
							Next
						</Button>
					</Flex>
				</Flex>
			)}
		</Box>
	)
}

export default BookingEventsList
