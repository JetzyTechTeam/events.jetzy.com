import React, { useEffect, useMemo, useState } from "react"
import EventCheckoutModel from "@Jetzy/components/EventCheckoutModel"
import { useWebShare } from "@Jetzy/hooks/useShare"
import EventTicketsComponent from "@/components/EventTicketsComponent"
import { IEvent } from "@/models/events/types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import Link from "next/link"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"
import Linkify from "linkify-react"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import Image from "next/image"
import LightNavbar from "@/components/layout/LightNavbar"
import Footer from "@/components/layout/Footer"
import CommentsSection, { UserType } from "@/components/events/CommentsSection"
import DiscussionBoard from "@/components/events/DiscussionBoard"
import { 
	CalendarIcon, 
	MapPinIcon, 
	UserGroupIcon, 
	ShareIcon, 
	EllipsisHorizontalIcon, 
	TicketIcon,
	QuestionMarkCircleIcon,
	ChatBubbleLeftRightIcon
} from "@heroicons/react/24/outline"
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
	AvatarGroup,
	Flex,
	IconButton,
	Menu,
	MenuButton,
	MenuList,
	MenuItem,
	Input,
	InputGroup,
	InputLeftElement,
	Select,
	Button,
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
	Heading
} from "@chakra-ui/react"
import { 
	MagnifyingGlassIcon, 
	EllipsisHorizontalIcon as EllipsisIcon,
	FunnelIcon,
	ArrowDownTrayIcon
} from "@heroicons/react/24/outline"

dayjs.extend(utc)
dayjs.extend(timezone)

type Props = {
	event: IEvent
}

// Hardcoded hosts - shown as placeholder
const defaultHosts = [
	{ name: "Host 1", image: null },
	{ name: "Host 2", image: null },
	{ name: "Host 3", image: null },
	{ name: "Host 4", image: null },
	{ name: "Host 5", image: null },
]

export default function HostedEvents({ event }: Props) {
	const router = useRouter()
	const [shareUrl, setShareUrl] = useState("")
	const [isTicketModalOpen, setIsTicketModalOpen] = useState(false)
	const { data: session } = useSession()

	// Validate event data early and safely
	const isValidEvent = event && event._id && event.name

	const clonedEvent = useMemo(() => {
		if (!isValidEvent) return null
		try { return structuredClone(event) } catch (error) { return null }
	}, [event, isValidEvent])

	const shareTitle = clonedEvent?.name || ""
	const shareDesc = clonedEvent?.desc || ""

	// Fetch totals to check for sold out / waiting list
	const { data: totals } = useQuery({
		queryKey: ["eventTotals", clonedEvent?._id],
		queryFn: () => axios.get(`/api/events/${clonedEvent?._id}/totals`),
		enabled: !!clonedEvent?._id
	})

	const totalSold = totals?.data?.totalTickets || 0
	const isSoldOut = clonedEvent?.capacity && clonedEvent.capacity > 0 && totalSold >= clonedEvent.capacity

	// @ts-ignore
	const isAdmin = session?.user?.role === "admin"

	useEffect(() => {
		if (typeof window !== "undefined") {
			setShareUrl(window.location.href)
		}
	}, [])

	const sharer = useWebShare({
		title: shareTitle,
		text: shareDesc,
		url: shareUrl,
	})

	const { formattedDate, formattedTime, formattedMonth, formattedDay } = useMemo(() => {
		if (!clonedEvent?.startsOn) return { formattedDate: "", formattedTime: "", formattedMonth: "", formattedDay: "" }
		try {
			const userTimeZone = clonedEvent?.timezone?.split(") ")[1] || clonedEvent?.timezone || "UTC"
			const date = dayjs.utc(clonedEvent.startsOn).tz(userTimeZone)
			return { 
				formattedDate: date.format("dddd, MMMM D, YYYY"), 
				formattedTime: date.format("h:mm A"),
				formattedMonth: date.format("MMM").toUpperCase(),
				formattedDay: date.format("D")
			}
		} catch (error) {
			return { formattedDate: "", formattedTime: "", formattedMonth: "", formattedDay: "" }
		}
	}, [clonedEvent?.startsOn, clonedEvent?.timezone])

	const hasEventEnded = useMemo(() => {
		if (!clonedEvent?.endsOn) return false
		return new Date() > new Date(clonedEvent.endsOn)
	}, [clonedEvent?.endsOn])

	if (!isValidEvent || !clonedEvent) {
		return <div className="min-h-screen flex items-center justify-center">Event Not Found</div>
	}

	return (
		<div className="min-h-screen bg-[#F0F2F5]">
			<LightNavbar />
			
			{/* Back Button */}
			<div className="max-w-[1250px] mx-auto px-4 lg:px-0 pt-4">
				<button
					onClick={() => router.back()}
					className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors font-medium mb-4"
				>
					<svg 
						xmlns="http://www.w3.org/2000/svg" 
						viewBox="0 0 24 24" 
						fill="none" 
						stroke="currentColor" 
						strokeWidth="2" 
						strokeLinecap="round" 
						strokeLinejoin="round" 
						className="w-5 h-5"
					>
						<path d="m12 19-7-7 7-7"/>
						<path d="M19 12H5"/>
					</svg>
					<span>Back</span>
				</button>
			</div>
			
			{/* Cover Photo Area */}
			<div className="bg-white shadow-sm border-b border-gray-300">
				<div className="max-w-[1250px] mx-auto px-4 lg:px-0 pt-0 pb-4">
					<div className="relative w-full h-[200px] md:h-[350px] lg:h-[400px] bg-gray-200 overflow-hidden rounded-b-xl mb-6">
						{clonedEvent.images && clonedEvent.images.length > 0 ? (
							<Image 
								src={clonedEvent.images[0]} 
								alt="Event Cover" 
								fill 
								className="object-cover" 
								priority
							/>
						) : (
							<div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
								No Cover Photo
							</div>
						)}
					</div>

					{/* Header Info */}
					<div className="flex flex-col md:flex-row gap-6 px-4">
						{/* Date Box (Left) */}
						<div className="hidden md:flex flex-col items-center p-3 bg-white rounded-xl shadow-sm border border-gray-200 h-fit w-20 flex-shrink-0">
							<span className="text-red-500 font-bold uppercase text-sm">{formattedMonth}</span>
							<span className="text-2xl font-bold text-gray-900">{formattedDay}</span>
						</div>

						<div className="flex-1">
							<div className="mb-2">
								<span className="text-red-500 font-bold uppercase text-sm mr-2">{formattedDate}</span>
								<span className="text-gray-500 text-sm">AT {formattedTime}</span>
							</div>
							<h1 className="text-3xl md:text-4xl font-bold text-[#1C1E21] mb-2">{clonedEvent.name}</h1>
							<p className="text-gray-600 font-medium mb-4">{clonedEvent.location}</p>

							{/* Action Bar */}
							<div className="flex flex-wrap gap-3 py-4 border-t border-gray-200 mt-4">
								<button 
									onClick={() => setIsTicketModalOpen(true)}
									disabled={hasEventEnded}
									className={`relative px-10 py-4 rounded-xl font-bold text-lg text-white transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-3 transform hover:scale-105 active:scale-95 ${
										hasEventEnded ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 animate-pulse"
									}`}
									style={{
										animation: hasEventEnded ? 'none' : 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
									}}
								>
									<TicketIcon className="w-7 h-7" />
									<span className="font-extrabold text-xl">
										{hasEventEnded ? "Event Ended" : (isSoldOut ? "Join Waiting List" : "Get Tickets")}
									</span>
									{!hasEventEnded && (
										<span className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full animate-bounce">
											🎟️
										</span>
									)}
								</button>
								
								<button 
									onClick={() => sharer.share()}
									className="px-4 py-2 bg-gray-200 text-gray-700 font-semibold text-sm rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2"
								>
									<ShareIcon className="w-5 h-5" />
									Share
								</button>
								
								<Menu>
									<MenuButton 
										as={IconButton}
										aria-label="More options"
										icon={<EllipsisHorizontalIcon className="w-6 h-6" />}
										variant="ghost"
										className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
										_hover={{ bg: "gray.300" }}
										bg="gray.200"
									/>
									<MenuList>
										<MenuItem icon={<TicketIcon className="w-4 h-4" />}>
											Save Event
										</MenuItem>
										<MenuItem icon={<ShareIcon className="w-4 h-4" />}>
											Copy Link
										</MenuItem>
										<MenuItem color="red.500" icon={<EllipsisHorizontalIcon className="w-4 h-4" />}>
											Report Event
										</MenuItem>
									</MenuList>
								</Menu>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Main Content Area */}
			<div className="max-w-[1250px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Left Column (Discussion) - Moved below to focus on Get Ticket */}
				<div className="lg:col-span-2 space-y-4 mt-8">
					<DiscussionBoard eventId={clonedEvent._id.toString()} />
				</div>

				{/* Right Column (Sidebar) */}
				<div className="space-y-4">
					{/* Location Card */}
					<div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
						<h2 className="text-xl font-bold text-[#1C1E21] mb-4">Location</h2>
						<div className="mb-4">
							<iframe
								width="100%"
								height="200"
								frameBorder="0"
								style={{ border: 0, borderRadius: '8px' }}
								src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}&q=${encodeURIComponent(clonedEvent.location)}`}
								allowFullScreen
							/>
						</div>
						<div className="flex items-start gap-3">
							<MapPinIcon className="w-6 h-6 text-gray-500 flex-shrink-0" />
							<div>
								<p className="font-semibold text-[#1C1E21]">{clonedEvent.location}</p>
							</div>
						</div>
					</div>

					{/* Sticky Ticket Card (Desktop) */}
					<div className="bg-white rounded-lg shadow-lg p-6 border-2 border-blue-200 sticky top-20 transform transition-all duration-300 hover:shadow-2xl">
						<div className="text-center">
							<p className="text-gray-500 text-sm mb-2 font-semibold">Tickets starting from</p>
							<p className="text-4xl font-extrabold text-[#1C1E21] mb-6">
								{clonedEvent.tickets && clonedEvent.tickets.length > 0 ? `$${Math.min(...clonedEvent.tickets.map(t => t.price))}` : 'Free'}
							</p>
							<button 
								onClick={() => setIsTicketModalOpen(true)}
								disabled={hasEventEnded}
								className={`relative w-full py-5 px-6 rounded-xl font-extrabold text-xl text-white transition-all duration-300 shadow-xl hover:shadow-2xl flex items-center justify-center gap-3 transform hover:scale-105 active:scale-95 ${
									hasEventEnded ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-800 hover:to-blue-900"
								}`}
								style={{
									animation: hasEventEnded ? 'none' : 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
								}}
							>
								<TicketIcon className="w-8 h-8" />
								<span>
									{hasEventEnded ? "Event Ended" : (isSoldOut ? "Join Waiting List" : "Get Tickets Now")}
								</span>
								{!hasEventEnded && (
									<span className="absolute -top-3 -right-3 bg-yellow-400 text-yellow-900 text-sm font-bold px-3 py-1.5 rounded-full animate-bounce shadow-lg">
										🎟️
									</span>
								)}
							</button>
							{!hasEventEnded && (
								<p className="text-xs text-gray-500 mt-3 font-medium">
									⚡ Limited availability - Secure your spot!
								</p>
							)}
						</div>
					</div>

					{/* About Details (Description) */}
					<div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
						<h2 className="text-xl font-bold text-[#1C1E21] mb-4">About</h2>
						<div className="flex items-start gap-4 mb-4">
							<UserGroupIcon className="w-6 h-6 text-gray-500 mt-1" />
							<div>
								<p className="text-[#1C1E21]">
									{clonedEvent.privacy === 'private' ? 'Private' : 'Public'}  · Anyone on or off Jetzy
								</p>
							</div>
						</div>
						<div className="space-y-4 text-[#1C1E21]">
							<EventDescription description={clonedEvent.desc} />
						</div>

						{/* Host Information */}
						{clonedEvent.host && clonedEvent.host.name && (
							<div className="mt-6 pt-6 border-t border-gray-200">
								<h3 className="text-lg font-semibold text-[#1C1E21] mb-4">Host Information</h3>
								<Flex align="center" gap={4} mb={3}>
									{clonedEvent.host.image ? (
										<Avatar src={clonedEvent.host.image} name={clonedEvent.host.name} size="md" />
									) : (
										<Avatar name={clonedEvent.host.name} size="md" bgGradient="linear(to-br, purple.400, purple.600)" color="white" />
									)}
									<Box>
										<Text fontSize="md" fontWeight="semibold" color="#1C1E21">{clonedEvent.host.name}</Text>
										{clonedEvent.host.email && (
											<Text fontSize="sm" color="#65676B" mt={1}>
												<a href={`mailto:${clonedEvent.host.email}`} className="text-blue-600 hover:underline">
													{clonedEvent.host.email}
												</a>
											</Text>
										)}
										{clonedEvent.host.phone && (
											<Text fontSize="sm" color="#65676B" mt={1}>
												<a href={`tel:${clonedEvent.host.phone}`} className="text-blue-600 hover:underline">
													{clonedEvent.host.phone}
												</a>
											</Text>
										)}
									</Box>
								</Flex>
							</div>
						)}
					</div>

					{/* Hosted By - Show only if no host info in about section */}
					{(!clonedEvent.host || !clonedEvent.host.name) && (
						<div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
							<h2 className="text-xl font-bold text-[#1C1E21] mb-4">Hosted by</h2>
							<Flex align="center" gap={3}>
								{defaultHosts.slice(0, 3).map((host, index) => (
									<Box
										key={index}
										w="40px"
										h="40px"
										borderRadius="full"
										bgGradient="linear(to-br, purple.400, purple.600)"
										display="flex"
										alignItems="center"
										justifyContent="center"
										color="white"
										fontWeight="semibold"
										boxShadow="md"
										border="2px solid white"
										ml={index > 0 ? "-12px" : "0"}
										zIndex={5 - index}
										title={host.name}
									>
										{host.name.charAt(0)}
									</Box>
								))}
								<Text fontSize="sm" color="gray.600" ml={2}>and {defaultHosts.length - 3} others</Text>
							</Flex>
						</div>
					)}

					{/* Guests Section */}
					<EventGuests eventId={clonedEvent._id.toString()} showParticipants={clonedEvent.showParticipants} />
				</div>
			</div>

			<Footer />

			{/* Ticket Modal */}
			{clonedEvent && <EventTicketsComponent event={clonedEvent} isOpen={isTicketModalOpen} onClose={() => setIsTicketModalOpen(false)} />}
			
			{/* Checkout Modal */}
			{clonedEvent?.name && <EventCheckoutModel event={clonedEvent.name} />}
		</div>
	)
}

function EventGuests({ eventId, showParticipants }: { eventId: string, showParticipants?: boolean }) {
    const { data: bookings, isLoading } = useQuery({
        queryKey: ["eventGuests", eventId],
        queryFn: () => axios.get(`/api/events/${eventId}/event-bookings`),
        enabled: !!showParticipants,
    })

    const guests = useMemo(() => {
        if (!bookings?.data) return []
        // Extract unique guests
        const unique = new Map();
        bookings.data.forEach((b: any) => {
            if (!unique.has(b.customerEmail)) {
                unique.set(b.customerEmail, { name: b.customerName, email: b.customerEmail });
            }
        });
        return Array.from(unique.values());
    }, [bookings?.data]);

    if (!showParticipants) return null;
    if (guests.length === 0) return null;

    return (
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
            <h2 className="text-xl font-bold text-[#1C1E21] mb-4">Guests</h2>
            <Flex align="center" gap={4}>
                 <AvatarGroup size="md" max={5}>
                    {guests.map((guest: any) => (
                        <Avatar key={guest.email} name={guest.name} />
                    ))}
                 </AvatarGroup>
                 <Text color="gray.600" fontSize="sm">{guests.length} going</Text>
            </Flex>
        </div>
    )
}

function EventDescription({ description }: { description: string }) {
	if (!description) return <p className="text-gray-500 italic">No description available</p>
	const lines = description.split("\n")
	const linkifyOptions = {
		target: "_blank",
		className: "text-blue-600 hover:underline",
	}

	return (
		<div className="text-base text-gray-800 break-words leading-relaxed">
			{lines.map((line, i) => (
				<p key={i} className="mb-3">
					<Linkify options={linkifyOptions}>{line}</Linkify>
				</p>
			))}
		</div>
	)
}

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
	qrCodeToken?: string
}

function EventBookings({ eventId }: { eventId: string }) {
	const toast = useToast()
	const { isOpen: isDetailsOpen, onOpen: onDetailsOpen, onClose: onDetailsClose } = useDisclosure()
	const { isOpen: isCancelOpen, onOpen: onCancelOpen, onClose: onCancelClose } = useDisclosure()
	const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
	const [isCancelling, setIsCancelling] = useState(false)
	const [isResending, setIsResending] = useState(false)
	const queryClient = useQueryClient()

	const { data: bookings, isLoading } = useQuery({
		queryKey: ["eventBookings", eventId],
		queryFn: () => axios.get(`/api/events/${eventId}/event-bookings`),
	})

	const { data: eventData } = useQuery({
		queryKey: ["event", eventId],
		queryFn: async () => {
			const response = await axios.get(`/api/events/${eventId}`)
			console.log("Event data response:", response.data)
			return response
		},
		enabled: !!eventId && !!selectedBooking,
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
				queryClient.invalidateQueries({ queryKey: ["eventBookings", eventId] })
				queryClient.invalidateQueries({ queryKey: ["eventTotals", eventId] })
				onCancelClose()
				setSelectedBooking(null)
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

	const handleResendReceipt = async (bookingId: string) => {
		setIsResending(true)
		try {
			const response = await axios.post(`/api/bookings/${bookingId}/resend-receipt`)
			if (response.data.status) {
				toast({
					title: "Success",
					description: "Receipt sent successfully",
					status: "success",
					duration: 3000,
					isClosable: true,
				})
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
											<Menu closeOnSelect={false}>
												<MenuButton
													as={IconButton}
													aria-label="Options"
													icon={<EllipsisIcon style={{ width: 20, height: 20 }} />}
													variant="ghost"
													size="sm"
													color="gray.500"
												/>
												<MenuList fontSize="sm">
													<MenuItem onClick={(e) => {
														e.preventDefault()
														e.stopPropagation()
														console.log("View Details clicked for booking:", booking._id)
														setSelectedBooking(booking)
														onDetailsOpen()
													}}>View Details</MenuItem>
													<MenuItem onClick={async (e) => {
														e.preventDefault()
														e.stopPropagation()
														setSelectedBooking(booking)
														await handleResendReceipt(booking._id)
													}} isDisabled={isResending || booking.status === "cancelled"}>
														{isResending ? "Sending..." : "Resend Receipt"}
													</MenuItem>
													<MenuItem 
														color="red.500" 
														onClick={(e) => {
															e.preventDefault()
															e.stopPropagation()
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
								))
							)}
						</Tbody>
					</Table>
				</Box>
			</Box>

			{/* View Details Modal */}
			<Modal isOpen={isDetailsOpen} onClose={onDetailsClose} size="xl">
				<ModalOverlay />
				<ModalContent>
					<ModalHeader>Booking Details</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						{!selectedBooking ? (
							<Text>No booking selected</Text>
						) : (
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
											<Badge
												colorScheme={
													selectedBooking.status === "confirmed" || selectedBooking.status === "approved" ? "green" :
													selectedBooking.status === "pending" ? "yellow" : "red"
												}
											>
												{selectedBooking.status}
											</Badge>
										</Flex>
										<Flex justify="space-between">
											<Text fontWeight="semibold">Booking Date:</Text>
											<Text>{new Date(selectedBooking.createdAt).toLocaleString()}</Text>
										</Flex>
									</Stack>
								</Box>

								{eventData?.data?.data ? (
									<>
										<Divider />

										<Box>
											<Heading size="sm" mb={3}>Event Information</Heading>
											<Stack spacing={2}>
												<Flex justify="space-between">
													<Text fontWeight="semibold">Event Name:</Text>
													<Text>{eventData.data.data.name}</Text>
												</Flex>
												<Flex justify="space-between">
													<Text fontWeight="semibold">Location:</Text>
													<Text>{eventData.data.data.location}</Text>
												</Flex>
												<Flex justify="space-between">
													<Text fontWeight="semibold">Date:</Text>
													<Text>{new Date(eventData.data.data.startsOn).toLocaleDateString()}</Text>
												</Flex>
											</Stack>
										</Box>

										<Divider />

										<Box>
											<Heading size="sm" mb={3}>Ticket Details</Heading>
											<Stack spacing={2}>
												{selectedBooking.tickets.map((ticket, idx) => {
													const eventTicket = eventData.data.data.tickets?.find((t: any) => t._id.toString() === ticket.ticketId.toString())
													return (
														<Box key={idx} p={3} bg="gray.50" borderRadius="md">
															<Flex justify="space-between" mb={1}>
																<Text fontWeight="semibold">{eventTicket?.name || "Unknown Ticket"}</Text>
																<Text>Qty: {ticket.quantity}</Text>
															</Flex>
															{eventTicket && (
																<Text fontSize="sm" color="gray.600">
																	${parseFloat(eventTicket.price || "0").toFixed(2)} each
																</Text>
															)}
														</Box>
													)
												})}
											</Stack>
										</Box>
									</>
								) : (
									<Flex justify="center" align="center" py={4}>
										<Spinner size="sm" />
										<Text ml={3} fontSize="sm" color="gray.500">Loading event details...</Text>
									</Flex>
								)}

								<Divider />

								<Box>
									<Heading size="sm" mb={3}>Payment Summary</Heading>
									<Stack spacing={2}>
										<Flex justify="space-between">
											<Text fontWeight="semibold">Subtotal:</Text>
											<Text>${selectedBooking.subTotal.toFixed(2)}</Text>
										</Flex>
										<Flex justify="space-between">
											<Text fontWeight="semibold">Tax:</Text>
											<Text>${selectedBooking.tax.toFixed(2)}</Text>
										</Flex>
										<Divider />
										<Flex justify="space-between">
											<Text fontWeight="bold" fontSize="lg">Total:</Text>
											<Text fontWeight="bold" fontSize="lg">${selectedBooking.total.toFixed(2)}</Text>
										</Flex>
									</Stack>
								</Box>
							</Stack>
						)}
					</ModalBody>
					<ModalFooter>
						<Button onClick={onDetailsClose}>Close</Button>
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
		</Box>
	)
}

export { EventBookings }
