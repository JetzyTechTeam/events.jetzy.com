import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { EventListingLoader } from "@Jetzy/components/placeholders/loader"
import { adminOnly } from "@Jetzy/lib/authSession"
import { ListEventsThunk, getEventState } from "@Jetzy/redux/reducers/eventsSlice"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { EventInterface, Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { useSession } from "next-auth/react"
import Link from "next/link"
import React from "react"
import CreateEventModal from "@/components/events/CreateEventModal"
import { useDisclosure, Box, Flex, Text, Button, SimpleGrid, Avatar, IconButton, Menu, MenuButton, MenuList, MenuItem } from "@chakra-ui/react"
import { FiPlus, FiCalendar, FiUsers, FiTrendingUp, FiMoreHorizontal, FiClock, FiMapPin } from "react-icons/fi"
import Image from "next/image"
import { DateTime } from "luxon"

export default function ConsoleDashboard() {
	const { isFetching, dataList } = useAppSelector(getEventState)
	const dispatcher = useAppDispatch()
	const { isOpen: isCreateModalOpen, onOpen: onCreateModalOpen, onClose: onCreateModalClose } = useDisclosure()

	const { data: session } = useSession()

	// @ts-ignore
	const admin = session?.user?.role === "admin"

	React.useEffect(() => {
		// Dispatcher the event to fetch events list from the server
		if (admin) {
			dispatcher(ListEventsThunk())
		}
	}, [admin])

	const handleEventCreated = () => {
		// Refresh events list
		dispatcher(ListEventsThunk())
		onCreateModalClose()
	}

	return (
		<>
			<Head>
				<title>Dashboard - Jetzy Events</title>
				<meta name="description" content="Manage your events, view bookings, and track your event performance on Jetzy." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Dasshboard} maxW="100%" bg="#F0F2F5">
				<Box maxW="1200px" mx="auto" px={{ base: 4, md: 0 }} py={6}>
					<Flex gap={8} direction={{ base: "column", lg: "row" }}>
						
						{/* MAIN FEED (Left/Center) */}
						<Box flex="2">
							{/* Welcome / Stats Banner */}
							<Box bg="white" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
								<Flex justify="space-between" align="center" mb={4}>
									<Box>
										<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">
											Welcome back, {session?.user?.name?.split(" ")[0] || "User"}!
										</Text>
										<Text color="#65676B">Here's what's happening with your events today.</Text>
									</Box>
									<Button
										onClick={onCreateModalOpen}
										bg="#1877F2"
										color="white"
										size="md"
										leftIcon={<FiPlus />}
										_hover={{ bg: "#166FE5" }}
										display={{ base: "none", md: "flex" }}
									>
										Create Event
									</Button>
								</Flex>

								<SimpleGrid columns={{ base: 1, sm: 3 }} spacing={4}>
									<Box p={4} bg="#F0F2F5" borderRadius="md">
										<Flex align="center" gap={3}>
											<Box p={2} bg="white" borderRadius="full">
												<FiCalendar color="#1877F2" />
											</Box>
											<Box>
												<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">{dataList?.length || 0}</Text>
												<Text fontSize="xs" color="#65676B" fontWeight="600" textTransform="uppercase">Total Events</Text>
											</Box>
										</Flex>
									</Box>
									<Box p={4} bg="#F0F2F5" borderRadius="md">
										<Flex align="center" gap={3}>
											<Box p={2} bg="white" borderRadius="full">
												<FiUsers color="#1877F2" />
											</Box>
											<Box>
												<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">--</Text>
												<Text fontSize="xs" color="#65676B" fontWeight="600" textTransform="uppercase">Total Guests</Text>
											</Box>
										</Flex>
									</Box>
									<Box p={4} bg="#F0F2F5" borderRadius="md">
										<Flex align="center" gap={3}>
											<Box p={2} bg="white" borderRadius="full">
												<FiTrendingUp color="#1877F2" />
											</Box>
											<Box>
												<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">--</Text>
												<Text fontSize="xs" color="#65676B" fontWeight="600" textTransform="uppercase">Page Views</Text>
											</Box>
										</Flex>
									</Box>
								</SimpleGrid>
							</Box>

							{/* Recent Activity / Events Feed */}
							<Box mb={4}>
								<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>Recent Events</Text>
								
								{isFetching ? (
									<EventListingLoader />
								) : !dataList?.length ? (
									<Box textAlign="center" py={12} bg="white" borderRadius="lg" boxShadow="sm">
										<Text color="#65676B" fontSize="lg">No events found.</Text>
										<Button mt={4} onClick={onCreateModalOpen} variant="outline" colorScheme="blue">
											Create your first event
										</Button>
									</Box>
								) : (
									<Box display="flex" flexDirection="column" gap={4}>
										{(dataList as EventInterface[]).slice(0, 5).map((event) => (
											<DashboardEventCard key={event._id} event={event} />
										))}
									</Box>
								)}
								
								{dataList && dataList.length > 5 && (
									<Button 
										w="full" 
										mt={4} 
										variant="ghost" 
										color="#1877F2" 
										fontWeight="600"
										as={Link}
										href="/console/events"
									>
										See All Events
									</Button>
								)}
							</Box>
						</Box>

						{/* SIDEBAR (Right) */}
						<Box flex="1" display={{ base: "none", lg: "block" }}>
							<Box bg="white" p={4} borderRadius="lg" boxShadow="sm" mb={4} position="sticky" top="20px">
								<Text fontSize="lg" fontWeight="bold" mb={4} color="#1C1E21">Quick Actions</Text>
								<Flex direction="column" gap={2}>
									<Button 
										justifyContent="flex-start" 
										variant="ghost" 
										leftIcon={<FiPlus />} 
										onClick={onCreateModalOpen}
										color="#1C1E21"
										_hover={{ bg: "#F0F2F5" }}
									>
										Create New Event
									</Button>
									<Button 
										justifyContent="flex-start" 
										variant="ghost" 
										leftIcon={<FiCalendar />} 
										as={Link}
										href="/console/events"
										color="#1C1E21"
										_hover={{ bg: "#F0F2F5" }}
									>
										Manage Events
									</Button>
									{/* Add more quick links here */}
								</Flex>
							</Box>
						</Box>
					</Flex>
				</Box>
			</ConsoleLayout>

			{/* Create Event Modal */}
			<CreateEventModal 
				isOpen={isCreateModalOpen} 
				onClose={onCreateModalClose} 
				onEventCreated={handleEventCreated}
			/>
		</>
	)
}

const DashboardEventCard = ({ event }: { event: EventInterface }) => {
	const eventDate = DateTime.fromISO(event.startsOn?.toString()).toLocal()
	
	return (
		<Box bg="white" borderRadius="lg" boxShadow="sm" overflow="hidden" border="1px solid" borderColor="#E5E7EB">
			<Flex>
				{/* Date Box (Left) */}
				<Flex 
					direction="column" 
					align="center" 
					justify="center" 
					p={4} 
					bg="#F0F2F5" 
					minW="80px"
					borderRight="1px solid"
					borderColor="#E5E7EB"
				>
					<Text fontSize="xs" fontWeight="bold" color="#D93025" textTransform="uppercase">
						{eventDate.toFormat("MMM")}
					</Text>
					<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">
						{eventDate.toFormat("d")}
					</Text>
				</Flex>

				{/* Content (Middle) */}
				<Flex p={4} flex="1" direction="column" justify="center">
					<Link href={`/console/events/${event._id}/manage`}>
						<Text 
							fontSize="lg" 
							fontWeight="bold" 
							color="#1C1E21" 
							_hover={{ color: "#1877F2", textDecoration: "underline" }}
							cursor="pointer"
							mb={1}
						>
							{event.name}
						</Text>
					</Link>
					<Flex align="center" gap={4} color="#65676B" fontSize="sm">
						<Flex align="center" gap={1}>
							<FiClock size={14} />
							<Text>{eventDate.toFormat("t")}</Text>
						</Flex>
						<Flex align="center" gap={1}>
							<FiMapPin size={14} />
							<Text noOfLines={1} maxW="200px">{event.location}</Text>
						</Flex>
					</Flex>
				</Flex>

				{/* Image (Right) */}
				{event.images && event.images.length > 0 && (
					<Box position="relative" w="120px" h="full" display={{ base: "none", sm: "block" }}>
						<Image 
							src={event.images[0]} 
							alt={event.name} 
							fill 
							className="object-cover"
						/>
					</Box>
				)}
			</Flex>
			
			{/* Footer Actions */}
			<Flex borderTop="1px solid" borderColor="#E5E7EB" p={2} justify="space-around">
				<Button 
					variant="ghost" 
					size="sm" 
					flex="1" 
					color="#65676B"
					_hover={{ bg: "#F0F2F5" }}
					as={Link}
					href={`/console/events/${event._id}/manage`}
				>
					Manage
				</Button>
				<Button 
					variant="ghost" 
					size="sm" 
					flex="1" 
					color="#65676B"
					_hover={{ bg: "#F0F2F5" }}
					as={Link}
					href={`/console/events/${event._id}/update`}
				>
					Edit
				</Button>
			</Flex>
		</Box>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	// Check if user is admin/super admin
	const sessionResult = await adminOnly(context)
	if (!sessionResult || "redirect" in sessionResult) return sessionResult
	
	return {
		props: {
			session: sessionResult.props.session,
		},
	}
}
