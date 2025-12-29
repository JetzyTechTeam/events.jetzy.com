import { DateTimeSVG, LocationSVG } from "@/assets/icons"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { adminOnly } from "@/lib/authSession"
import { useEdgeStore } from "@/lib/edgestore"
import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import { DeleteEventThunk } from "@/redux/reducers/eventsSlice"
import { useAppDispatch } from "@/redux/stores"
import { Roles, Pages } from "@/types"
import { AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, Button, useDisclosure, Box, Flex, Text, SimpleGrid, Menu, MenuButton, MenuList, MenuItem, IconButton, Badge } from "@chakra-ui/react"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { useSession } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import React, { useRef, useState } from "react"
import { toast } from "react-toastify"
import CreateEventModal from "@/components/events/CreateEventModal"
import { FiMoreHorizontal, FiCalendar, FiMapPin, FiClock, FiPlus } from "react-icons/fi"
import { DateTime } from "luxon"

type Pagination = {
	total: number
	page: number
	showing: number
	limit: number
	totalPages: number
}

type Props = {
	events: string
	pagination: Pagination
}

export default function EventsListing({ events, pagination }: Props) {
	const initialData = JSON.parse(events) as IEvent[]
	const [eventList, setEventList] = React.useState<IEvent[]>(initialData)
	const { data: session } = useSession()
	const router = useRouter()
	const { isOpen: isCreateModalOpen, onOpen: onCreateModalOpen, onClose: onCreateModalClose } = useDisclosure()

	const handleEventRemoved = (removedEventId: string) => {
		setEventList((prevList) => prevList.filter((event) => event._id.toString() !== removedEventId))
	}

	const handlePageChange = (newPage: number) => {
		router.push({
			pathname: router.pathname,
			query: { ...router.query, page: newPage },
		})
	}

	const handleEventCreated = () => {
		// Refresh the page to show the new event
		router.reload()
	}

	// Role check is now handled server-side in getServerSideProps via adminOnly middleware

	return (
		<>
			<Head>
				<title>My Events - Jetzy Events</title>
				<meta name="description" content="Manage all your created events, edit details, and track performance." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout maxW="100%" page={Pages.Events}>
				<Box maxW="1200px" mx="auto" px={{ base: 4, md: 0 }} py={6}>
					<Flex justify="space-between" align="center" mb={6}>
						<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">Events</Text>
						<Button
							onClick={onCreateModalOpen}
							bg="#1877F2"
							color="white"
							size="md"
							leftIcon={<FiPlus />}
							_hover={{ bg: "#166FE5" }}
							fontWeight="600"
							boxShadow="sm"
						>
							Create Event
						</Button>
					</Flex>

					{!eventList.length && (
						<Box textAlign="center" py={12} bg="white" borderRadius="lg" boxShadow="sm">
							<Text color="#65676B" fontSize="lg">No events found.</Text>
							<Button mt={4} onClick={onCreateModalOpen} variant="outline" colorScheme="blue">
								Create your first event
							</Button>
						</Box>
					)}

					<SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
						{eventList.map((event) => (
							<ListingCard {...event} key={event.slug} onEventRemoved={handleEventRemoved} />
						))}
					</SimpleGrid>

					{/* Pagination Controls */}
					{pagination.totalPages > 1 && (
						<Box mt={8} mb={8}>
							<Flex justify="space-between" align="center" bg="white" p={4} borderRadius="lg" boxShadow="sm">
								{/* Page Info */}
								<Text fontSize="sm" color="#65676B">
									Showing <Text as="span" fontWeight="semibold" color="#1C1E21">{pagination.showing}</Text> of <Text as="span" fontWeight="semibold" color="#1C1E21">{pagination.total}</Text> events
								</Text>

								{/* Page Navigation */}
								<Flex gap={2}>
									<Button
										onClick={() => handlePageChange(pagination.page - 1)}
										isDisabled={pagination.page === 1}
										size="sm"
										variant="outline"
									>
										Previous
									</Button>

									{/* Page Numbers */}
									<Flex display={{ base: "none", sm: "flex" }} gap={1}>
										{Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => {
											const showPage = pageNum === 1 || pageNum === pagination.totalPages || (pageNum >= pagination.page - 1 && pageNum <= pagination.page + 1)

											if (!showPage) {
												if (pageNum === pagination.page - 2 || pageNum === pagination.page + 2) {
													return <Text key={pageNum} px={2} color="#65676B">...</Text>
												}
												return null
											}

											return (
												<Button
													key={pageNum}
													onClick={() => handlePageChange(pageNum)}
													size="sm"
													variant={pageNum === pagination.page ? "solid" : "ghost"}
													colorScheme={pageNum === pagination.page ? "blue" : "gray"}
													bg={pageNum === pagination.page ? "#1877F2" : "transparent"}
													color={pageNum === pagination.page ? "white" : "#65676B"}
													_hover={{ bg: pageNum === pagination.page ? "#166FE5" : "#F0F2F5" }}
												>
													{pageNum}
												</Button>
											)
										})}
									</Flex>

									<Button
										onClick={() => handlePageChange(pagination.page + 1)}
										isDisabled={pagination.page === pagination.totalPages}
										size="sm"
										variant="outline"
									>
										Next
									</Button>
								</Flex>
							</Flex>
						</Box>
					)}
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

const ListingCard = (props: IEvent & { onEventRemoved: (id: string) => void }) => {
	const event = props
	const dispatcher = useAppDispatch()
	const edgestore = useEdgeStore()
	const [loading, setLoading] = React.useState(false)
	const router = useRouter()
	const { isOpen, onOpen, onClose } = useDisclosure()
	const cancelRef = useRef(null)
	const [selectedEvent, setSelectedEvent] = useState<IEvent | null>(null)

	const handleRemove = (item: IEvent) => {
		setLoading(true)
		dispatcher(DeleteEventThunk({ id: item._id.toString() }))
			.then((res: any) => {
				// delete the images from edge store server
				if (item.images.length > 0) {
					item.images.forEach((image) => {
						edgestore.edgestore.publicFiles.delete({ url: image })
					})
				}
				toast.success("Event deleted successfully!")
				props.onEventRemoved(item._id.toString())
			})
			.finally(() => {
				setLoading(false)
			})
	}

	const confirmDelete = (event: IEvent) => {
		setSelectedEvent(event)
		onOpen()
	}

	const eventDate = DateTime.fromISO(event.startsOn?.toString()).toLocal()
	const dateStr = eventDate.toFormat("EEE, MMM d")
	const timeStr = eventDate.toFormat("t")

	return (
		<>
			<Box 
				bg="white" 
				borderRadius="lg" 
				overflow="hidden" 
				boxShadow="sm" 
				border="1px solid" 
				borderColor="#E5E7EB"
				transition="all 0.2s"
				_hover={{ boxShadow: "md", transform: "translateY(-2px)" }}
				display="flex"
				flexDirection="column"
				h="100%"
			>
				{/* Image Section */}
				<Box position="relative" w="full" pt="56.25%"> {/* 16:9 Aspect Ratio */}
					{event.images && event.images.length > 0 ? (
						<Image 
							src={event.images[0]} 
							alt={event.name} 
							fill 
							className="object-cover"
							sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
						/>
					) : (
						<Box position="absolute" top="0" left="0" w="full" h="full" bg="gray.100" display="flex" alignItems="center" justifyContent="center">
							<Text color="gray.400">No Image</Text>
						</Box>
					)}
					{/* Date Badge */}
					<Box 
						position="absolute" 
						top="3" 
						left="3" 
						bg="white" 
						borderRadius="md" 
						px={3} 
						py={1} 
						boxShadow="md" 
						textAlign="center"
					>
						<Text fontSize="xs" fontWeight="bold" color="red.500" textTransform="uppercase">
							{eventDate.toFormat("MMM")}
						</Text>
						<Text fontSize="lg" fontWeight="bold" color="gray.800" lineHeight="1">
							{eventDate.toFormat("d")}
						</Text>
					</Box>
				</Box>

				{/* Content Section */}
				<Flex p={4} direction="column" flex="1">
					<Text fontSize="xs" fontWeight="semibold" color="#D93025" textTransform="uppercase" mb={1}>
						{dateStr} AT {timeStr}
					</Text>
					
					<Link href={`/${event.slug}`}>
						<Text 
							fontSize="lg" 
							fontWeight="bold" 
							color="#1C1E21" 
							mb={1} 
							_hover={{ color: "#1877F2", textDecoration: "underline" }}
							noOfLines={2}
							cursor="pointer"
						>
							{event.name}
						</Text>
					</Link>
					
					<Text fontSize="sm" color="#65676B" mb={4} noOfLines={1}>
						{event.location}
					</Text>
					
					<Flex justify="space-between" align="center" mt="auto">
						<Text fontSize="sm" color="#65676B">
							{0} guests
						</Text>
						
						{/* Actions Menu */}
						<Menu>
							<MenuButton as={IconButton} icon={<FiMoreHorizontal />} variant="ghost" size="sm" />
							<MenuList>
								<MenuItem icon={<FiCalendar />} onClick={() => router.push(`/console/events/${event._id}/manage`)}>Manage Event</MenuItem>
								<MenuItem icon={<FiMoreHorizontal />} onClick={() => router.push(`/console/events/${event._id}/update`)}>Edit Details</MenuItem>
								<MenuItem icon={<Box color="red.500">🗑️</Box>} onClick={() => confirmDelete(event)} color="red.500">Delete Event</MenuItem>
							</MenuList>
						</Menu>
					</Flex>
					
					<Button 
						mt={3} 
						w="full" 
						bg="#E4E6EB" 
						color="#1C1E21" 
						_hover={{ bg: "#D8DADF" }}
						size="sm"
						fontWeight="600"
						onClick={() => router.push(`/console/events/${event._id}/manage`)}
					>
						Manage
					</Button>
				</Flex>
			</Box>

			<AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose}>
				<AlertDialogOverlay>
					<AlertDialogContent bg="white" borderRadius="lg" boxShadow="xl">
						<AlertDialogHeader fontSize="lg" fontWeight="bold">
							Delete Event
						</AlertDialogHeader>

						<AlertDialogBody>
							Are you sure you want to delete <Text as="span" fontWeight="bold">{selectedEvent?.name}</Text>? This action cannot be undone.
						</AlertDialogBody>

						<AlertDialogFooter>
							<Button ref={cancelRef} onClick={onClose} variant="ghost">
								Cancel
							</Button>
							<Button
								colorScheme="red"
								onClick={() => {
									if (selectedEvent) {
										handleRemove(selectedEvent)
										onClose()
									}
								}}
								ml={3}
								isLoading={loading}
							>
								Delete
							</Button>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialogOverlay>
			</AlertDialog>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	// check if user is admin/super admin
	const sessionResult = await adminOnly(context)
	if (!sessionResult || "redirect" in sessionResult) return sessionResult

	const session = sessionResult.props.session

	// lets paginate the events
	const limit = 10
	const page = context.query.page ? parseInt(context.query.page as string) : 1
	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		console.log("[console/events] Database not connected, attempting to connect...")
		await dbconn.asPromise()
	}

	const skip = (page - 1) * limit
	// Fetch events - admins can see all events (public and private)
	const events = await Events.find({ isDeleted: false }).limit(limit).skip(skip).sort({ createdAt: -1 })
	if (!events) return { props: { events: [] } }

	// get total count of events
	const total = await Events.countDocuments({ isDeleted: false })
	// serialize the events
	const data = events.map((event) => event.toJSON())

	// calculate page total and current page
	const totalPages = Math.ceil(total / limit)

	// pagination object
	const pagination = {
		total,
		page,
		showing: data.length,
		limit,
		totalPages,
	}

	return {
		props: {
			events: JSON?.stringify(data),
			pagination,
			session,
		},
	}
}
