import ConsoleLayout from "@Jetzy/components/layout/ConsoleLayout"
import { EventListingLoader } from "@Jetzy/components/placeholders/loader"
import { EventInterface, Pages } from "@Jetzy/types"
import { GetServerSideProps } from "next"
import Head from "next/head"
import { useSession, getSession } from "next-auth/react"
import Link from "next/link"
import React, { useState } from "react"
import CreateEventModal from "@/components/events/CreateEventModal"
import { useDisclosure, Box, Flex, Text, Button, SimpleGrid, useToast } from "@chakra-ui/react"
import { FiPlus, FiCalendar, FiUsers, FiTrendingUp, FiClock, FiMapPin, FiBarChart2 } from "react-icons/fi"
import Image from "next/image"
import { DateTime } from "luxon"
import { http_client as api } from "@/configs/api"
import { useRouter } from "next/router"

export default function SellerDashboard() {
	const [events, setEvents] = useState<EventInterface[]>([])
	const [stats, setStats] = useState<any>({ totalViews: 0, totalSales: 0, totalRevenue: 0 })
	const [isLoading, setIsLoading] = useState(true)
	const { isOpen: isCreateModalOpen, onOpen: onCreateModalOpen, onClose: onCreateModalClose } = useDisclosure()

	const { data: session } = useSession()
	const toast = useToast()
	const router = useRouter()
	const hasFetchedRef = React.useRef(false)
	const isFetchingRef = React.useRef(false)
	const userIdRef = React.useRef<string | null>(null)

	const fetchSellerData = React.useCallback(async () => {
		// Prevent multiple simultaneous calls
		if (isFetchingRef.current) {
			console.log('[SellerDashboard] Fetch already in progress, skipping')
			return
		}
		
		console.log('[SellerDashboard] Starting fetchSellerData')
		isFetchingRef.current = true
		setIsLoading(true)
		
		// 1. Fetch My Events
		try {
			console.log('[SellerDashboard] Calling API: /api/events?mode=mine')
			const startTime = Date.now()
			
			// Use fetch directly to avoid axios interceptor issues
			const fetchRes = await fetch("/api/events?mode=mine", {
				method: 'GET',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
				}
			})
			
			if (!fetchRes.ok) {
				const errorText = await fetchRes.text()
				console.error(`[SellerDashboard] API returned ${fetchRes.status}:`, errorText)
				throw new Error(`API request failed with status ${fetchRes.status}: ${errorText}`)
			}
			
			const eventsRes = await fetchRes.json()
			console.log('[SellerDashboard] Fetch succeeded, response:', eventsRes)
			
			const duration = Date.now() - startTime
			console.log(`[SellerDashboard] API call completed in ${duration}ms`)
			
			console.log('[SellerDashboard] Events API Response received:', {
				response: eventsRes,
				responseType: typeof eventsRes,
				hasStatus: eventsRes && typeof eventsRes === 'object' && 'status' in eventsRes,
				isArray: Array.isArray(eventsRes),
				status: eventsRes?.status,
				dataType: typeof eventsRes?.data,
				dataIsArray: Array.isArray(eventsRes?.data),
				dataLength: Array.isArray(eventsRes?.data) ? eventsRes.data.length : 'not array'
			})
			
			// http_client interceptor returns response.data directly, which is the sendResponse structure
			// Structure: { message, status, code, data }
			if (eventsRes && typeof eventsRes === 'object' && 'status' in eventsRes) {
				if (eventsRes.status === true) {
					// Success - extract data array
					const eventsArray = Array.isArray(eventsRes.data) ? eventsRes.data : []
					console.log('[SellerDashboard] Setting events:', eventsArray.length, 'events')
					setEvents(eventsArray)
				} else {
					// API returned unsuccessful response
					console.log('[SellerDashboard] API returned unsuccessful status')
					setEvents([])
				}
			} else {
				// Unexpected response structure - might be direct array or different format
				if (Array.isArray(eventsRes)) {
					console.log('[SellerDashboard] Response is direct array:', eventsRes.length, 'events')
					setEvents(eventsRes)
				} else {
					console.log('[SellerDashboard] Unexpected response structure, setting empty array')
					setEvents([])
				}
			}
		} catch (error: any) {
			// http_client interceptor returns error?.response?.data, which might be undefined for network errors
			// Only log meaningful errors to avoid "undefined" console messages
			if (error !== null && error !== undefined) {
				if (typeof error === 'object') {
					// Check if it's an error response from the API
					if (error.status === false || error.code || error.statusCode) {
						const errorCode = error.code || error.statusCode
						// Only log actual server/auth errors
						if (errorCode >= 500 || errorCode === 401 || errorCode === 403) {
							console.error("[SellerDashboard] API error:", {
								message: error.message,
								code: errorCode,
								status: error.status
							})
						}
					}
				} else if (typeof error === 'string' && error.trim()) {
					console.error("[SellerDashboard] API error (string):", error)
				}
			}
			// Set empty array on any error - this is acceptable (user might not have events)
			setEvents([])
		}

		// 2. Fetch Aggregated Stats
		try {
			console.log('[SellerDashboard] Fetching stats')
			const statsRes = await fetch("/api/console/seller/stats", {
				method: 'GET',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
				}
			})
			
			if (!statsRes.ok) {
				const errorText = await statsRes.text()
				console.error('[SellerDashboard] Stats API failed:', statsRes.status, errorText)
				setStats({ totalViews: 0, totalSales: 0, totalRevenue: 0 })
				return
			}
			
			const res = await statsRes.json()
			console.log('[SellerDashboard] Stats API response:', res)
			
			if (res?.status && res?.data) {
				// Default to empty stats if no data
				setStats(res.data || { totalViews: 0, totalSales: 0, totalRevenue: 0 })
			} else {
				// API returned unsuccessful response - not an error, just empty data
				setStats({ totalViews: 0, totalSales: 0, totalRevenue: 0 })
			}
		} catch (error: any) {
			console.error("[SellerDashboard] Failed to fetch stats:", error)
			setStats({ totalViews: 0, totalSales: 0, totalRevenue: 0 })
		}
		
		setIsLoading(false)
		isFetchingRef.current = false
	}, [])

	React.useEffect(() => {
		const currentUserId = (session?.user as any)?._id
		
		console.log('[SellerDashboard] useEffect triggered', {
			hasSession: !!session,
			currentUserId,
			userIdRef: userIdRef.current,
			hasFetched: hasFetchedRef.current,
			shouldFetch: currentUserId && (userIdRef.current !== currentUserId || !hasFetchedRef.current)
		})
		
		// Only fetch once when session is available and user ID hasn't changed
		if (currentUserId && (userIdRef.current !== currentUserId || !hasFetchedRef.current)) {
			userIdRef.current = currentUserId
			hasFetchedRef.current = true
			console.log('[SellerDashboard] Calling fetchSellerData from useEffect')
			fetchSellerData()
		}
	}, [session?.user, fetchSellerData])

	const handleEventCreated = () => {
		onCreateModalClose()
		// Use router.reload() like admin dashboard does - ensures fresh data from server
		// This is more reliable than client-side refresh
		setTimeout(() => {
			router.reload()
		}, 300)
	}

	return (
		<>
			<Head>
				<title>Seller Dashboard - Jetzy Events</title>
				<meta name="description" content="Manage your events and track performance." />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			<ConsoleLayout page={Pages.Dasshboard} maxW="100%">
				<Box maxW="1200px" mx="auto" px={{ base: 4, md: 0 }} py={6}>
					<Flex gap={8} direction={{ base: "column", lg: "row" }}>
						
						{/* MAIN FEED */}
						<Box flex="2">
							{/* Welcome / Stats Banner */}
							<Box bg="white" p={6} borderRadius="lg" boxShadow="sm" mb={6}>
								<Flex justify="space-between" align="center" mb={4}>
									<Box>
										<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">
											Seller Dashboard
										</Text>
										<Text color="#65676B">Manage your events and view performance.</Text>
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
												<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">{events.length}</Text>
												<Text fontSize="xs" color="#65676B" fontWeight="600" textTransform="uppercase">My Events</Text>
											</Box>
										</Flex>
									</Box>
									<Box p={4} bg="#F0F2F5" borderRadius="md">
										<Flex align="center" gap={3}>
											<Box p={2} bg="white" borderRadius="full">
												<FiUsers color="#1877F2" />
											</Box>
											<Box>
												<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">{stats.totalViews}</Text>
												<Text fontSize="xs" color="#65676B" fontWeight="600" textTransform="uppercase">Total Views</Text>
											</Box>
										</Flex>
									</Box>
									<Box p={4} bg="#F0F2F5" borderRadius="md">
										<Flex align="center" gap={3}>
											<Box p={2} bg="white" borderRadius="full">
												<FiBarChart2 color="#1877F2" />
											</Box>
											<Box>
												<Text fontSize="2xl" fontWeight="bold" color="#1C1E21">${stats.totalRevenue?.toFixed(2) || "0.00"}</Text>
												<Text fontSize="xs" color="#65676B" fontWeight="600" textTransform="uppercase">Total Revenue</Text>
											</Box>
										</Flex>
									</Box>
								</SimpleGrid>
							</Box>

							{/* My Events List */}
							<Box mb={4}>
								<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>My Events</Text>
								
								{isLoading ? (
									<EventListingLoader />
								) : events.length === 0 ? (
									<Box textAlign="center" py={12} bg="white" borderRadius="lg" boxShadow="sm">
										<Text color="#65676B" fontSize="lg">You haven&apos;t created any events yet.</Text>
										<Button mt={4} onClick={onCreateModalOpen} variant="outline" colorScheme="blue">
											Create your first event
										</Button>
									</Box>
								) : (
									<Box display="flex" flexDirection="column" gap={4}>
										{events.map((event) => (
											<DashboardEventCard key={String(event._id)} event={event} />
										))}
									</Box>
								)}
							</Box>
						</Box>

						{/* SIDEBAR */}
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
								</Flex>
							</Box>
						</Box>
					</Flex>
				</Box>
			</ConsoleLayout>

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
					Manage & Market
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
	const session = await getSession(context)
	
	if (!session) {
		return {
			redirect: {
				destination: "/login",
				permanent: false,
			},
		}
	}
	
	return {
		props: {
			session,
		},
	}
}

