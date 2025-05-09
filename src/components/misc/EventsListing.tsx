import React, { useMemo } from "react"
import { Box, Image, Text, Stack, SimpleGrid, Container, useColorModeValue, Badge, Heading, Button } from "@chakra-ui/react"
import { IEvent } from "@/models/events/types"
import Pagination from "./Pagination"
import { useRouter } from "next/router"
import { ROUTES } from "@/configs/routes"
import { DateTimeSVG, LocationSVG } from "@/assets/icons"

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
	const cardBg = useColorModeValue("#1e1e1e", "gray.700")
	const borderColor = useColorModeValue("#434343", "gray.600")

	// calculate the event creation date difference from now in days to a a new badge
	const eventDate = new Date(event.createdAt.toString())
	const currentDate = new Date()
	const diffTime = Math.abs(currentDate.getTime() - eventDate.getTime())
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
	const location = event.location;

	const isNew = diffDays < 2

	const { formattedDate, formattedTime } = useMemo(() => {
    const date = new Date(event.startsOn);
    return {
      formattedDate: date.toDateString(),
      formattedTime: date.toLocaleTimeString(),
    };
  }, [event.startsOn]);


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
			<Box p='2'>
				<Image src={event.images[0]} alt={event.name} objectFit="cover" w="100%" h="200px" rounded='lg' />
			</Box>
			<Box p="2">
				<Stack spacing="3">
					<Text fontSize="xl" fontWeight="bold">
						{event.name}
					</Text>
					<Box h='24'>
						<Text fontSize="sm" color="gray.500" suppressHydrationWarning display='flex' gap='2'>
							<DateTimeSVG />
							{formattedDate} {formattedTime}
						</Text>
						<Text fontSize="sm" color="gray.500" suppressHydrationWarning display='flex' gap='2' mt='2'>
						<span><LocationSVG /></span>
							{location}
						</Text>
					</Box>
					<Box bg='#3E3E3E' w='max-content' px='2' py='1' rounded='lg' display='flex' justifyContent='end'>
						<Text className="uppercase text-xs font-semibold">get tickets</Text>
					</Box>
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
			maxW="container.lg"
			display={"flex"}
			flexDir={"column"}
			gap={2}
			justifyContent={"space-between"}
			py={10}
			className="min-h-screen w-full"
		>
			<Box mb='6'>
				<Heading>Discover Events</Heading>
				<Text pt='3'>Discover exciting events where you can enjoy activities that match your interests and passions!</Text>
			</Box>
			<SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="8">
				{items.map((event) => (
					<EventCard key={event._id.toString()} event={event} onClick={handleEventClick} />
				))}
			</SimpleGrid>

			<Pagination totalItems={pagination.total} perPageItems={items.length} pageNo={pagination.page} onPageChange={(page) => console.log(page)} />
		</Container>
	)
}

export default EventList
