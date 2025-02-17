import React from "react"
import { Box, Image, Text, Stack, SimpleGrid, Container, useColorModeValue, Badge } from "@chakra-ui/react"
import { IEvent } from "@/models/events/types"
import Pagination from "./Pagination"
import { useRouter } from "next/router"
import { ROUTES } from "@/configs/routes"

type EventType = {
	id: number
	name: string
	date: string
	image: string
	details: string
}

interface EventCardProps {
	event: IEvent
	onClick: (event: IEvent) => void
}

const EventCard: React.FC<EventCardProps> = ({ event, onClick }) => {
	const cardBg = useColorModeValue("white", "gray.700")
	const borderColor = useColorModeValue("gray.200", "gray.600")

	// calculate the event creation date difference from now in days to a a new badge
	const eventDate = new Date(event.createdAt.toString())
	const currentDate = new Date()
	const diffTime = Math.abs(currentDate.getTime() - eventDate.getTime())
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

	const isNew = diffDays < 7

	return (
		<Box
			borderWidth="1px"
			borderColor={borderColor}
			borderRadius="lg"
			overflow="hidden"
			bg={cardBg}
			boxShadow="lg"
			cursor="pointer"
			_hover={{ transform: "scale(1.03)", transition: "transform 0.2s ease-in-out" }}
			onClick={() => onClick(event)}
		>
			<Image src={event.images[0]} alt={event.name} objectFit="cover" w="100%" h="200px" />
			<Box p="6">
				<Stack spacing="3">
					<Text fontSize="xl" fontWeight="bold">
						{event.name}
						{isNew && (
							<Badge ml="1" fontSize="0.8em" colorScheme="purple" rounded={"md"}>
								New
							</Badge>
						)}
					</Text>
					<Text fontSize="md" color="gray.500">
						{new Date(event.startsOn.toString()).toDateString()} {new Date(event.startsOn.toString()).toLocaleTimeString()}
						<br />
						<Badge ml="1" fontSize="0.8em" colorScheme="orange" rounded={"md"}>
							{event.isPaid ? "Get Tickets" : "Free"}
						</Badge>
					</Text>
				</Stack>
			</Box>
		</Box>
	)
}

type EventListProps = {
	items: IEvent[]
	pagination: {
		total: number
		page: number
		showing: number
		limit: number
		totalPages: number
	}
}
const EventList: React.FC<EventListProps> = ({ items, pagination }) => {
	const router = useRouter()

	const handleEventClick = (event: IEvent): void => {
		// Replace this with navigation or modal display for event details

		router.push(ROUTES.eventDetails.replace("[slug]", event.slug))
	}

	return (
		<Container
			maxW="container.full"
			display={"flex"}
			flexDir={"column"}
			gap={2}
			justifyContent={"space-between"}
			py={10}
			className="min-h-screen w-full bg-gradient-to-br from-purple-900 to-indigo-900"
		>
			<SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing="8">
				{items.map((event) => (
					<EventCard key={event._id.toString()} event={event} onClick={handleEventClick} />
				))}
			</SimpleGrid>

			<Pagination totalItems={pagination.total} perPageItems={items.length} pageNo={pagination.page} onPageChange={(page) => console.log(page)} />
		</Container>
	)
}

export default EventList
