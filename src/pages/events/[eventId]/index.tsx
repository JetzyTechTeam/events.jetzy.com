import React, { useState } from "react"
import {
	Box,
	Container,
	Text,
	Heading,
	Button,
	HStack,
	VStack,
	Image,
	Avatar,
	AvatarGroup,
	Flex,
	Icon,
	Badge,
	SimpleGrid,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalCloseButton,
	IconButton,
} from "@chakra-ui/react"
import { MdArrowBack, MdCalendarToday, MdAccessTime, MdLocationOn, MdShare, MdRemove, MdAdd } from "react-icons/md"
import { useRouter } from "next/router"
import Navbar from "@Jetzy/components/layout/Navbar"
import Footer from "@Jetzy/components/layout/Footer"

// Mock featured guests data
const featuredGuests = [
	{ name: "Abil", role: "Product Manager", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Abil" },
	{ name: "Karisima", role: "Design Lead", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Karisima" },
	{ name: "Michael", role: "Engineer", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Michael" },
	{ name: "Richard", role: "Frontend Lead", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Richard" },
]

// Mock co-hosts data
const coHosts = [
	{ name: "Host 1", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Host1" },
	{ name: "Host 2", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Host2" },
	{ name: "Host 3", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Host3" },
	{ name: "Host 4", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Host4" },
	{ name: "Host 5", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Host5" },
]

const EventDetailsPage: React.FC = () => {
	const router = useRouter()
	const { eventId } = router.query
	const [isRegistered, setIsRegistered] = useState(false)
	const [isTicketModalOpen, setIsTicketModalOpen] = useState(false)
	const [ticketQuantity, setTicketQuantity] = useState(1)

	// Mock ticket data
	const ticket = {
		name: "Free Ticket",
		description: "Select your tickets and proceed to checkout\nThis is a free ticket",
		price: 0.0,
	}

	const handleIncrement = () => setTicketQuantity((prev) => prev + 1)
	const handleDecrement = () => setTicketQuantity((prev) => (prev > 1 ? prev - 1 : 1))
	const totalPrice = ticket.price * ticketQuantity

	// Mock event data - in production, this would come from API
	const event = {
		id: eventId,
		title: "Jetzy Product Launch & Community Meetup",
		date: "Tuesday, September 24",
		time: "6:00 PM - 8:00 PM",
		location: "Jetzy HQ, New York, New York",
		image: "/imgs/event-placeholder.jpg",
		tag: "JETZY PRODUCT UPDATE",
		description: "Jetzy hardlaunching new features with Grid view, Social, Hotels portal fixes, Website Redesign, and Maps PhD",
		presentedBy: {
			name: "Jetzy Community",
			followers: 1234,
		},
		hostedBy: {
			name: "Jetzy Community",
		},
		rating: 5,
	}

	return (
		<Box bg="gray.50" minH="100vh">
			<Navbar />

			{/* Spacer for fixed header */}
			<Box h="72px" />
			<Container maxW={{ base: "600px", md: "800px" }} py={{ base: 4, md: 6 }} px={{ base: 4, md: 6 }}>
				{/* Back Button */}
				<Button variant="ghost" leftIcon={<MdArrowBack />} mb={4} color="gray.700" _hover={{ bg: "gray.100" }} size="sm" pl={0} onClick={() => router.back()}>
					Back
				</Button>

				{/* Main Content Card */}
				<Box bg="white" rounded="2xl" shadow="md" overflow="hidden">
					{/* Event Image with Overlay */}
					<Box position="relative" h={{ base: "180px", md: "220px" }}>
						<Image src={event.image} alt={event.title} w="full" h="full" objectFit="cover" fallback={<Box w="full" h="full" bg="gray.300" />} />
						<Box position="absolute" inset={0} bg="rgba(120, 80, 160, 0.5)" />

						{/* Event Tag */}
						<Box position="absolute" top={4} left="50%" transform="translateX(-50%)">
							<Text fontSize="10px" fontWeight="semibold" color="white" letterSpacing="wider" textAlign="center">
								{event.tag}
							</Text>
						</Box>

						{/* Event Title Overlay */}
						<VStack position="absolute" bottom={0} left={0} right={0} p={6} spacing={2} align="center" bg="linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent)">
							<Heading size="md" color="white" textAlign="center" lineHeight="1.3" fontWeight="bold">
								{event.title.toUpperCase()}
							</Heading>
							<Text color="white" fontSize="sm" fontWeight="medium">
								SEPTEMBER 24
							</Text>
						</VStack>
					</Box>

					{/* Content Section */}
					<Box p={6}>
						{/* Title and Meta Grid Layout */}
						<Flex gap={6} mb={6} direction={{ base: "column", md: "row" }}>
							{/* Left: Title and Info */}
							<VStack align="start" spacing={4} flex={1}>
								<Heading size="sm" color="gray.900" fontWeight="bold">
									{event.title}
								</Heading>

								{/* Registration Section */}
								<Box bg="purple.50" p={4} rounded="lg" mb={6}>
									<Text fontSize="sm" fontWeight="semibold" color="purple.700" mb={2}>
										Registration
									</Text>
									<Text color="gray.700" fontSize="sm" mb={3}>
										Welcome! To join the event, please register below.
									</Text>
									<Button bg="purple.600" color="white" _hover={{ bg: "purple.700" }} w="full" size="md" onClick={() => setIsTicketModalOpen(true)}>
										{isRegistered ? "✓ Registered" : "Register"}
									</Button>
								</Box>
							</VStack>

							{/* Right: Featured Guests */}
							<VStack align="start" spacing={4} minW={{ base: "full", md: "200px" }}>
								{/* Event Meta Information */}
								<VStack align="start" spacing={2.5} fontSize="sm" color="gray.700" w="full">
									<HStack spacing={2}>
										<Icon as={MdCalendarToday} w={4} h={4} color="gray.600" />
										<Text fontSize="sm">{event.date}</Text>
									</HStack>
									<HStack spacing={2}>
										<Icon as={MdAccessTime} w={4} h={4} color="gray.600" />
										<Text fontSize="sm">{event.time}</Text>
									</HStack>
									<HStack spacing={2} align="start">
										<Icon as={MdLocationOn} w={4} h={4} color="gray.600" mt={0.5} />
										<VStack align="start" spacing={0}>
											<Text fontSize="sm" fontWeight="medium">
												Jetzy HQ
											</Text>
											<Text fontSize="xs" color="gray.500">
												New York, New York
											</Text>
										</VStack>
									</HStack>
								</VStack>
								<Text fontSize="sm" fontWeight="semibold" color="gray.500">
									Featured guests
								</Text>
								<SimpleGrid columns={3} spacing={3} w="full">
									{featuredGuests.map((guest, index) => (
										<VStack key={index} align="center" spacing={1.5}>
											<Avatar name={guest.name} src={guest.avatar} size="md" />
											<VStack spacing={0} align="center">
												<Text fontSize="10px" fontWeight="bold" color="gray.900" textAlign="center" lineHeight="1.2">
													{guest.name}
												</Text>
												<Text fontSize="8px" color="gray.600" textAlign="center" lineHeight="1.2">
													{guest.role}
												</Text>
											</VStack>
										</VStack>
									))}
								</SimpleGrid>
							</VStack>
						</Flex>

						{/* About Event */}
						<VStack align="start" spacing={3} mb={6}>
							<Text fontSize="sm" fontWeight="semibold" color="gray.500">
								About Event
							</Text>
							<Text color="gray.700" fontSize="sm" lineHeight="1.6">
								{event.description}
							</Text>
						</VStack>

						{/* Two column layout for Presented By and Hosted By */}
						<SimpleGrid columns={2} spacing={6} w="full">
							<Box>
								{/* Presented By */}
								<VStack align="start" spacing={3} mb={6}>
									<Text fontSize="sm" fontWeight="semibold" color="gray.500">
										Presented by
									</Text>
									<HStack spacing={3}>
										<Avatar name={event.presentedBy.name} size="sm" bg="gray.300" />
										<HStack spacing={1}>
											<Text fontWeight="semibold" fontSize="sm" color="gray.900">
												Jetzy Community
											</Text>
											<Text fontSize="md" color="gray.400">
												...
											</Text>
										</HStack>
									</HStack>
								</VStack>
								{/* Hosted By */}
								<VStack align="start" spacing={3} mb={6}>
									<Text fontSize="sm" fontWeight="semibold" color="gray.500">
										Hosted by
									</Text>
									<HStack spacing={2} align="center">
										<Avatar name="1 0" size="sm" bg="purple.100" color="purple.600"></Avatar>
										<Text fontSize="sm" color="gray.900">
											Jetzy Community
										</Text>
									</HStack>
									<HStack spacing={-1}>
										{coHosts.map((host, index) => (
											<Avatar key={index} name={host.name} src={host.avatar} size="sm" border="2px solid white" borderColor="white" />
										))}
									</HStack>
								</VStack>
							</Box>
							<Box>
								{/* Questions */}
								<VStack align="start" spacing={2}>
									<Text fontSize="sm" fontWeight="semibold" color="gray.500">
										Questions?
									</Text>
									<Text color="gray.700" fontSize="sm">
										Ben at ben@jetzyapp.com
									</Text>
								</VStack>
							</Box>
						</SimpleGrid>
					</Box>
				</Box>
			</Container>

			{/* Ticket Selection Modal */}
			<Modal isOpen={isTicketModalOpen} onClose={() => setIsTicketModalOpen(false)} size="md" isCentered>
				<ModalOverlay bg="blackAlpha.600" />
				<ModalContent mx={4} rounded="2xl" overflow="hidden">
					<ModalHeader pt={6} pb={2}>
						<HStack spacing={2}>
							<IconButton icon={<MdArrowBack />} aria-label="Back" variant="ghost" size="sm" onClick={() => setIsTicketModalOpen(false)} color="gray.600" _hover={{ bg: "gray.100" }} />
							<Box flex={1}>
								<Heading size="md" color="gray.900">
									Tickets
								</Heading>
							</Box>
						</HStack>
						<Text fontSize="sm" color="gray.600" mt={2} fontWeight="normal">
							Select your tickets and proceed to checkout
						</Text>
					</ModalHeader>
					<ModalCloseButton top={6} right={4} />

					<ModalBody pb={6}>
						{/* Ticket Card */}
						<Box border="1px" borderColor="gray.200" rounded="xl" p={4} mb={6}>
							<VStack align="start" spacing={3}>
								<Box w="full">
									<Text fontSize="md" fontWeight="semibold" color="gray.900" mb={1}>
										{ticket.name}
									</Text>
									<Text fontSize="sm" color="gray.600" mb={3} whiteSpace="pre-line">
										{ticket.description}
									</Text>
								</Box>

								<HStack justify="space-between" w="full" align="center">
									<Text fontSize="xl" fontWeight="bold" color="purple.600">
										${ticket.price.toFixed(2)}
									</Text>

									{/* Quantity Controls */}
									<HStack spacing={2} bg="purple.50" rounded="full" px={2} py={1}>
										<IconButton
											icon={<MdRemove />}
											aria-label="Decrease quantity"
											size="sm"
											rounded="full"
											bg="white"
											color="purple.600"
											_hover={{ bg: "purple.100" }}
											onClick={handleDecrement}
											isDisabled={ticketQuantity === 1}
											minW="32px"
											h="32px"
										/>
										<Text fontSize="md" fontWeight="semibold" color="purple.700" minW="24px" textAlign="center">
											{ticketQuantity}
										</Text>
										<IconButton
											icon={<MdAdd />}
											aria-label="Increase quantity"
											size="sm"
											rounded="full"
											bg="white"
											color="purple.600"
											_hover={{ bg: "purple.100" }}
											onClick={handleIncrement}
											minW="32px"
											h="32px"
										/>
									</HStack>
								</HStack>
							</VStack>
						</Box>

						{/* Total and Checkout */}
						<HStack justify="space-between" align="center">
							<Box>
								<Text fontSize="sm" color="gray.600" mb={1}>
									Total:
								</Text>
								<Text fontSize="2xl" fontWeight="bold" color="gray.900">
									${totalPrice.toFixed(2)}
								</Text>
							</Box>
							<Button
								bg="purple.600"
								color="white"
								_hover={{ bg: "purple.700" }}
								size="lg"
								px={8}
								rounded="lg"
								onClick={() => {
									setIsRegistered(true)
									setIsTicketModalOpen(false)
								}}
							>
								Checkout
							</Button>
						</HStack>
					</ModalBody>
				</ModalContent>
			</Modal>

			<Footer />
		</Box>
	)
}

export default EventDetailsPage
