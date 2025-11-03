import React, { useState } from "react"
import { Box, Container, Text, Heading, Grid, Button, HStack, VStack, Image, Badge, Icon, SimpleGrid, Flex, Select, Spacer } from "@chakra-ui/react"
import { MdRestaurant, MdNightlife, MdFavoriteBorder, MdAirplanemodeActive, MdTheaters, MdSportsFootball, MdCalendarToday, MdAccessTime, MdLocationOn, MdArrowForward } from "react-icons/md"
import { useRouter } from "next/router"
import Navbar from "@Jetzy/components/layout/Navbar"
import Footer from "@Jetzy/components/layout/Footer"

// Category icons using react-icons
const categories = [
	{ name: "Dining", icon: MdRestaurant, color: "orange.100", events: "127 Events" },
	{ name: "Nightlife", icon: MdNightlife, color: "purple.100", events: "87 Events" },
	{ name: "Lifestyle", icon: MdFavoriteBorder, color: "pink.100", events: "72 Events" },
	{ name: "Travels", icon: MdAirplanemodeActive, color: "blue.100", events: "18 Events" },
	{ name: "Entertainment", icon: MdTheaters, color: "red.100", events: "91 Events" },
	{ name: "Activities", icon: MdSportsFootball, color: "yellow.100", events: "118 Events" },
]

// Mock data for prototype
const popularEvents = [
	{
		id: 1,
		title: "Jetzy Product Launch & Community Meetup",
		image: "/imgs/event-placeholder.jpg",
		date: "Nov 15",
		time: "7:00 PM",
		attendees: "24 going",
	},
	{
		id: 2,
		title: "Jetzy Product Launch & Community Meetup",
		image: "/imgs/event-placeholder.jpg",
		date: "Nov 16",
		time: "6:30 PM",
		attendees: "18 going",
	},
	{
		id: 3,
		title: "Jetzy Product Launch & Community Meetup",
		image: "/imgs/event-placeholder.jpg",
		date: "Nov 17",
		time: "8:00 PM",
		attendees: "32 going",
	},
	{
		id: 4,
		title: "Jetzy Product Launch & Community Meetup",
		image: "/imgs/event-placeholder.jpg",
		date: "Nov 18",
		time: "7:30 PM",
		attendees: "27 going",
	},
	{
		id: 5,
		title: "Jetzy Product Launch & Community Meetup",
		image: "/imgs/event-placeholder.jpg",
		date: "Nov 19",
		time: "6:00 PM",
		attendees: "41 going",
	},
	{
		id: 6,
		title: "Jetzy Product Launch & Community Meetup",
		image: "/imgs/event-placeholder.jpg",
		date: "Nov 20",
		time: "7:45 PM",
		attendees: "35 going",
	},
]

const featuredEvents = [
	{
		id: 1,
		title: "Jetzy Product Launch & Community Meetup",
		description: "Join us for an exciting evening of networking and product demos as we unveil Jetzy's latest features and connect with our vibrant community.",
		image: "/imgs/event-placeholder.jpg",
		date: "Nov 22",
		time: "7:00 PM",
		attendees: "156 going",
	},
	{
		id: 2,
		title: "Jetzy Product Launch & Community Meetup",
		description: "Join us for an exciting evening of networking and product demos as we unveil Jetzy's latest features and connect with our vibrant community.",
		image: "/imgs/event-placeholder.jpg",
		date: "Nov 23",
		time: "6:30 PM",
		attendees: "89 going",
	},
	{
		id: 3,
		title: "Jetzy Product Launch & Community Meetup",
		description: "Join us for an exciting evening of networking and product demos as we unveil Jetzy's latest features and connect with our vibrant community.",
		image: "/imgs/event-placeholder.jpg",
		date: "Nov 24",
		time: "8:00 PM",
		attendees: "203 going",
	},
]

const HomePage: React.FC = () => {
	const router = useRouter()
	const [selectedLocation, setSelectedLocation] = useState("New York, NY")

	const handleEventClick = (eventId: number) => {
		router.push(`/events/${eventId}`)
	}

	return (
		<Box bg="gray.50" minH="100vh">
			<Navbar />

			{/* Spacer for fixed header */}
			<Box h="72px" />

			<Container maxW="1200px" py={{ base: 4, md: 8 }} px={{ base: 4, md: 6 }}>
				{/* Find Events Header */}
				<VStack align="start" spacing={4} mb={8}>
					<Flex direction={{ base: "column", sm: "row" }} align={{ base: "start", sm: "center" }} gap={4} w="full">
						<Heading size="xl" color="gray.800" whiteSpace="nowrap">
							Find Events
						</Heading>
						<Select
							color={"gray.600"}
							value={selectedLocation}
							onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedLocation(e.target.value)}
							width={{ base: "full", sm: "200px" }}
							variant="outline"
							bg="white"
							size={{ base: "md", md: "md" }}
						>
							<option value="New York, NY">New York, NY</option>
							<option value="Los Angeles, CA">Los Angeles, CA</option>
							<option value="Chicago, IL">Chicago, IL</option>
						</Select>
					</Flex>
					<Text color="gray.600" fontSize={{ base: "sm", md: "lg" }}>
						Find events happening nearby, search by category, or explore community calendars for more options.
					</Text>
				</VStack>
				{/* Popular Events */}
				<Box mb={12}>
					<Flex direction={{ base: "column", md: "row" }} justify={{ base: "start", md: "space-between" }} align={{ base: "start", md: "center" }} mb={6} gap={4}>
						<VStack align="start" spacing={0}>
							<Heading size={{ base: "md", md: "lg" }} color="gray.800">
								Popular Events
							</Heading>
							<Text fontSize={{ base: "xs", md: "sm" }} color="gray.600">
								{selectedLocation}
							</Text>
						</VStack>
						<Button variant="outline" size="sm" borderColor="purple.600" color="purple.600" _hover={{ bg: "purple.50" }} rightIcon={<MdArrowForward />}>
							View All
						</Button>
					</Flex>
					<SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 4, md: 6 }}>
						{popularEvents.map((event) => (
							<Flex
								key={event.id}
								bg="white"
								rounded="lg"
								overflow="hidden"
								shadow="sm"
								_hover={{ shadow: "md", transform: "translateY(-2px)" }}
								transition="all 0.2s"
								cursor="pointer"
								gap={{ base: 3, md: 4 }}
								p={{ base: 3, md: 4 }}
								onClick={() => handleEventClick(event.id)}
							>
								{/* Event Image */}
								<Box minW={{ base: "70px", md: "100px" }} w={{ base: "70px", md: "100px" }} h={{ base: "70px", md: "100px" }} bg="gray.300" rounded="md" overflow="hidden" flexShrink={0}>
									<Image src={event.image} alt={event.title} w="full" h="full" objectFit="cover" fallback={<Box w="full" h="full" bg="gray.300" />} />
								</Box>

								{/* Event Content */}
								<VStack align="start" spacing={2} flex="1" justify="center">
									<Text fontWeight="bold" fontSize={{ base: "xs", md: "md" }} color="blue.600" noOfLines={2} _hover={{ textDecoration: "underline" }}>
										{event.title}
									</Text>
									<HStack spacing={{ base: 2, md: 3 }} fontSize={{ base: "xs", md: "sm" }} color="gray.600" flexWrap="wrap">
										<HStack spacing={1}>
											<Icon as={MdCalendarToday} w={{ base: 3, md: 4 }} h={{ base: 3, md: 4 }} />
											<Text>{event.date}</Text>
										</HStack>
										<HStack spacing={1}>
											<Icon as={MdAccessTime} w={{ base: 3, md: 4 }} h={{ base: 3, md: 4 }} />
											<Text>{event.time}</Text>
										</HStack>
										<HStack spacing={1} display={{ base: "none", md: "flex" }}>
											<Icon as={MdLocationOn} w={{ base: 3, md: 4 }} h={{ base: 3, md: 4 }} />
											<Text>Jetzy HQ</Text>
										</HStack>
									</HStack>
								</VStack>
							</Flex>
						))}
					</SimpleGrid>
				</Box>
				{/* Filter by Category */}
				<Box mb={12}>
					<Flex direction={{ base: "column", md: "row" }} justify={{ base: "start", md: "space-between" }} align={{ base: "start", md: "center" }} mb={6} gap={4}>
						<Heading size={{ base: "md", md: "lg" }} color="gray.800">
							Filter by Category
						</Heading>
						<Button variant="outline" size="sm" borderColor="purple.600" color="purple.600" _hover={{ bg: "purple.50" }} rightIcon={<MdArrowForward />}>
							View All
						</Button>
					</Flex>

					<SimpleGrid columns={{ base: 2, sm: 3, md: 3, lg: 6 }} spacing={{ base: 3, md: 4 }}>
						{categories.map((category) => (
							<Flex
								key={category.name}
								bg="white"
								p={{ base: 2.5, md: 3 }}
								rounded="lg"
								align="center"
								cursor="pointer"
								_hover={{ shadow: "md" }}
								transition="all 0.2s"
								shadow="sm"
								gap={{ base: 2, md: 3 }}
								border="1px"
								borderColor="gray.200"
								direction={{ base: "column", md: "row" }}
								textAlign={{ base: "center", md: "left" }}
								minH="auto"
							>
								<Box bg={category.color} w={{ base: "40px", md: "48px" }} h={{ base: "40px", md: "48px" }} rounded="md" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
									<Icon as={category.icon} w={{ base: 5, md: 6 }} h={{ base: 5, md: 6 }} color="gray.700" />
								</Box>
								<VStack align={{ base: "center", md: "start" }} spacing={0} flex={{ base: "auto", md: 1 }} minW={0} maxW="full">
									<Text fontWeight="semibold" fontSize={{ base: "10px", md: "sm" }} color="gray.800" noOfLines={1} w="full">
										{category.name}
									</Text>
									<Text fontSize={{ base: "9px", md: "xs" }} color="gray.600" noOfLines={1} w="full">
										{category.events}
									</Text>
								</VStack>
							</Flex>
						))}
					</SimpleGrid>
				</Box>
				{/* Featured Events */}
				<Box mb={12}>
					<Flex direction={{ base: "column", md: "row" }} justify={{ base: "start", md: "space-between" }} align={{ base: "start", md: "center" }} mb={6} gap={4}>
						<VStack align="start" spacing={0}>
							<Heading size={{ base: "md", md: "lg" }} color="gray.800">
								Featured Events
							</Heading>
							<Text fontSize={{ base: "xs", md: "sm" }} color="gray.600">
								{selectedLocation}
							</Text>
						</VStack>
						<Button variant="outline" size="sm" borderColor="purple.600" color="purple.600" _hover={{ bg: "purple.50" }} rightIcon={<MdArrowForward />}>
							View All
						</Button>
					</Flex>

					<VStack spacing={{ base: 4, md: 6 }} align="stretch">
						{featuredEvents.map((event) => (
							<Box key={event.id} bg="white" rounded="lg" overflow="hidden" shadow="sm" _hover={{ shadow: "md" }} transition="all 0.2s">
								<Flex direction={{ base: "column", md: "row" }}>
									<Box w={{ base: "100%", md: "200px" }} h={{ base: "120px", md: "150px" }} bg="gray.300" flexShrink={0}>
										<Image src={event.image} alt={event.title} w="full" h="full" objectFit="cover" fallback={<Box w="full" h="full" bg="gray.300" />} />
									</Box>
									<Box flex="1" p={{ base: 4, md: 6 }}>
										<Flex direction={{ base: "column", sm: "row" }} justify="space-between" align={{ base: "start", sm: "start" }} gap={{ base: 3, md: 4 }}>
											<VStack align="start" spacing={{ base: 2, md: 2 }} flex="1">
												<Heading size={{ base: "sm", md: "md" }} color="gray.800">
													{event.title}
												</Heading>
												<Text color="gray.600" fontSize={{ base: "xs", md: "sm" }} noOfLines={2}>
													{event.description}
												</Text>
												<HStack spacing={{ base: 2, md: 4 }} fontSize={{ base: "xs", md: "sm" }} color="gray.600" flexWrap="wrap">
													<HStack spacing={1}>
														<Icon as={MdCalendarToday} w={{ base: 3, md: 4 }} h={{ base: 3, md: 4 }} />
														<Text>{event.date}</Text>
													</HStack>
													<HStack spacing={1}>
														<Icon as={MdAccessTime} w={{ base: 3, md: 4 }} h={{ base: 3, md: 4 }} />
														<Text>{event.time}</Text>
													</HStack>
													<HStack spacing={1} display={{ base: "none", md: "flex" }}>
														<Icon as={MdLocationOn} w={{ base: 3, md: 4 }} h={{ base: 3, md: 4 }} />
														<Text>{event.attendees}</Text>
													</HStack>
												</HStack>
											</VStack>
											<Button bg="purple.600" color="white" size={{ base: "sm", md: "sm" }} _hover={{ bg: "purple.700" }} flexShrink={0} ml={{ base: 0, md: 4 }}>
												More Detail
											</Button>
										</Flex>
									</Box>
								</Flex>
							</Box>
						))}
					</VStack>
				</Box>
			</Container>

			<Footer />
		</Box>
	)
}

export default HomePage
