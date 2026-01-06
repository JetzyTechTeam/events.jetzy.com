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
import { useAnalytics } from "@/hooks/useAnalytics"
import Linkify from "linkify-react"
import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import Image from "next/image"
import LightNavbar from "@/components/layout/LightNavbar"
import Footer from "@/components/layout/Footer"
import CommentsSection, { UserType } from "@/components/events/CommentsSection"
import DiscussionBoard from "@/components/events/DiscussionBoard"
import JetzyChatIntegration from "@/components/events/JetzyChatIntegration"
import SafeHTML from "@/components/misc/SafeHTML"
import { useAppDispatch, useAppSelector } from "@Jetzy/redux/stores"
import { toggleCheckoutForm, setSelectedTickets, getCheckoutStore } from "@Jetzy/redux/reducers/checkoutSlice"
import { ROUTES } from "@/configs/routes"
import {
	CalendarIcon,
	MapPinIcon,
	UserGroupIcon,
	ShareIcon,
	EllipsisHorizontalIcon,
	TicketIcon,
	QuestionMarkCircleIcon,
	ChatBubbleLeftRightIcon,
	BookmarkIcon
} from "@heroicons/react/24/outline"
import {
	BookmarkIcon as BookmarkSolidIcon
} from "@heroicons/react/24/solid"
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
	MenuDivider,
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
	Heading,
	Tabs,
	TabList,
	TabPanels,
	Tab,
	TabPanel
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
	const [isReportModalOpen, setIsReportModalOpen] = useState(false)
	const [reportReason, setReportReason] = useState("")
	const [reportDescription, setReportDescription] = useState("")
	const [isSubmittingReport, setIsSubmittingReport] = useState(false)
	const [isSaved, setIsSaved] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [isCheckingSaved, setIsCheckingSaved] = useState(true)
	const [activeTabIndex, setActiveTabIndex] = useState(0)
	const { data: session } = useSession()
	const toast = useToast()
	const { trackEventInteraction } = useAnalytics()

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

	const dispatch = useAppDispatch()
	const { tickets, showCheckout } = useAppSelector(getCheckoutStore)
	const queryClient = useQueryClient()

	useEffect(() => {
		if (typeof window !== "undefined") {
			setShareUrl(window.location.href)
		}
	}, [])

	// Check if event is saved when component loads
	useEffect(() => {
		const checkSavedStatus = async () => {
			if (!session || !clonedEvent?._id) {
				setIsCheckingSaved(false)
				return
			}

			try {
				setIsCheckingSaved(true)
				const response = await axios.get(`/api/events/check-saved?eventId=${clonedEvent._id}`)
				setIsSaved(response.data.data?.isSaved || false)
			} catch (error) {
				console.error("Error checking saved status:", error)
				setIsSaved(false)
			} finally {
				setIsCheckingSaved(false)
			}
		}

		checkSavedStatus()
	}, [session, clonedEvent?._id])

	// Auto-reopen checkout form when returning from cancel page
	useEffect(() => {
		if (typeof window !== "undefined") {
			const shouldRetry = sessionStorage.getItem("checkout_retry")
			
			if (shouldRetry === "true") {
				// Try to restore tickets from sessionStorage
				const storedTickets = sessionStorage.getItem("checkout_tickets")
				let parsedTickets: any[] = []
				
				if (storedTickets) {
					try {
						parsedTickets = JSON.parse(storedTickets)
						if (Array.isArray(parsedTickets) && parsedTickets.length > 0) {
							// Ensure all restored tickets have isSelected: true and proper structure
							const ticketsToRestore = parsedTickets.map(t => ({
								...t,
								isSelected: true, // Ensure they're marked as selected
								quantity: t.quantity || 0 // Ensure quantity is set
							}))
							
							// Restore tickets to Redux state immediately
							dispatch(setSelectedTickets(ticketsToRestore))
							console.log("[HostedEvents] ✅ Restored", ticketsToRestore.length, "tickets from sessionStorage:", ticketsToRestore)
							
							// Clear the retry flag
							sessionStorage.removeItem("checkout_retry")
							
							// Reopen checkout form after a delay to ensure Redux state is updated and page is loaded
							setTimeout(() => {
								dispatch(toggleCheckoutForm(true))
								console.log("[HostedEvents] ✅ Auto-opened checkout form - ready to proceed with same tickets!")
							}, 600)
						} else {
							console.warn("[HostedEvents] Stored tickets array is empty")
							sessionStorage.removeItem("checkout_retry")
							sessionStorage.removeItem("checkout_tickets")
						}
					} catch (e) {
						console.error("[HostedEvents] Error parsing stored tickets:", e)
						sessionStorage.removeItem("checkout_retry")
						sessionStorage.removeItem("checkout_tickets")
					}
				} else {
					console.warn("[HostedEvents] No tickets found in sessionStorage")
					sessionStorage.removeItem("checkout_retry")
				}
			}
		}
	}, [dispatch]) // Run on mount and when dispatch changes

	// Handle save/unsave event
	const handleSaveEvent = async () => {
		if (!session) {
			toast({
				title: "Login required",
				description: "Please log in to save events",
				status: "warning",
				duration: 2000,
				isClosable: true,
			})
			return
		}

		if (!clonedEvent?._id) {
			toast({
				title: "Error",
				description: "Event information is not available",
				status: "error",
				duration: 2000,
				isClosable: true,
			})
			return
		}

		setIsSaving(true)
		try {
			const action = isSaved ? "unsave" : "save"
			const response = await axios.post("/api/events/save", {
				eventId: clonedEvent._id,
				action,
			})

			if (response.data.status) {
				setIsSaved(response.data.data?.isSaved || false)
				// Invalidate saved events count query to update the badge
				queryClient.invalidateQueries({ queryKey: ["saved-events-count"] })
				toast({
					title: isSaved ? "Event unsaved" : "Event saved",
					description: isSaved
						? "Event has been removed from your saved events"
						: "Event has been saved to your collection",
					status: "success",
					duration: 2000,
					isClosable: true,
				})
			} else {
				throw new Error(response.data.message || "Failed to save event")
			}
		} catch (error: any) {
			console.error("Error saving/unsaving event:", error)
			toast({
				title: "Error",
				description: error.response?.data?.message || error.message || "Failed to save event. Please try again.",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		} finally {
			setIsSaving(false)
		}
	}

	const sharer = useWebShare({
		title: shareTitle,
		text: shareDesc,
		url: shareUrl,
	})

	const { formattedDate, formattedTime, formattedMonth, formattedDay } = useMemo(() => {
		if (!clonedEvent?.startsOn) return { formattedDate: "", formattedTime: "", formattedMonth: "", formattedDay: "" }
		try {
			// Extract timezone - handle both "(UTC-05:00) America/New_York" format and plain timezone name
			let userTimeZone: string
			if (clonedEvent?.timezone?.includes(") ")) {
				userTimeZone = clonedEvent.timezone.split(") ")[1]
			} else {
				userTimeZone = clonedEvent?.timezone || "UTC"
			}
			
			// Validate timezone is not a date format
			if (userTimeZone.match(/^\d{4}-\d{2}-\d{2}/) || userTimeZone.match(/^\d{2}:\d{2}$/)) {
				console.warn("[HostedEvents] Invalid timezone format detected, using UTC:", clonedEvent?.timezone)
				userTimeZone = "UTC"
			}
			
			// Convert UTC date to user's timezone
			const utcDate = dayjs.utc(clonedEvent.startsOn)
			const localDate = utcDate.tz(userTimeZone)
			
			// Debug logging
			if (process.env.NODE_ENV === "development") {
				console.log("[HostedEvents] Timezone conversion:", {
					originalUTC: utcDate.format("YYYY-MM-DD HH:mm:ss UTC"),
					timezone: userTimeZone,
					converted: localDate.format("YYYY-MM-DD HH:mm:ss z"),
					storedTimezone: clonedEvent?.timezone
				})
			}
			
			return {
				formattedDate: localDate.format("dddd, MMMM D, YYYY"),
				formattedTime: localDate.format("hh:mm A"),
				formattedMonth: localDate.format("MMM").toUpperCase(),
				formattedDay: localDate.format("D")
			}
		} catch (error) {
			console.error("[HostedEvents] Error formatting date with timezone:", error, "Timezone:", clonedEvent?.timezone)
			// Fallback to UTC if timezone conversion fails
			try {
				const date = dayjs.utc(clonedEvent.startsOn)
				return {
					formattedDate: date.format("dddd, MMMM D, YYYY"),
					formattedTime: date.format("hh:mm A"),
					formattedMonth: date.format("MMM").toUpperCase(),
					formattedDay: date.format("D")
				}
			} catch (fallbackError) {
				return { formattedDate: "", formattedTime: "", formattedMonth: "", formattedDay: "" }
			}
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
						<path d="m12 19-7-7 7-7" />
						<path d="M19 12H5" />
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
							<h1 className="text-3xl md:text-4xl font-bold text-[#1C1E21] mb-2">
								<SafeHTML html={clonedEvent.name} />
							</h1>
							{clonedEvent.venueName ? (
								<div className="mb-4">
									<p className="text-gray-900 font-semibold mb-1">{clonedEvent.venueName}</p>
									<p className="text-gray-600 font-medium">{clonedEvent.location}</p>
								</div>
							) : (
								<p className="text-gray-600 font-medium mb-4">{clonedEvent.location}</p>
							)}

							{/* Action Bar */}
							<div className="flex flex-wrap gap-3 py-4 border-t border-gray-200 mt-4">
								<button
									onClick={async () => {
										// Track booking button click
										if (clonedEvent?._id && !hasEventEnded) {
											await trackEventInteraction(clonedEvent._id.toString(), 'booking_start', {
												isSoldOut: isSoldOut
											})
										}
										setIsTicketModalOpen(true)
									}}
									disabled={hasEventEnded}
									className={`relative px-10 py-4 rounded-xl font-bold text-lg text-white transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-3 transform hover:scale-105 active:scale-95 ${hasEventEnded ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 animate-pulse"
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
									onClick={async () => {
										// Track share interaction
										if (clonedEvent?._id) {
											await trackEventInteraction(clonedEvent._id.toString(), 'share', {
												method: 'web_share'
											})
										}
										sharer.share()
									}}
									className="px-4 py-2 bg-gray-200 text-gray-700 font-semibold text-sm rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2"
								>
									<ShareIcon className="w-5 h-5" />
									Share
								</button>

								<Menu>
									<MenuButton
										as={IconButton}
										aria-label="More options"
										icon={<EllipsisHorizontalIcon className="w-5 h-5" />}
										variant="ghost"
										className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors w-10 h-10 flex items-center justify-center"
										_hover={{ bg: "gray.300" }}
										bg="gray.200"
									/>
									<MenuList
										bg="white"
										border="1px solid #E5E7EB"
										borderRadius="12px"
										boxShadow="0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
										py={2}
										minW="180px"
									>
										<MenuItem
											icon={
												isSaved ? (
													<BookmarkSolidIcon className="w-4 h-4" />
												) : (
													<BookmarkIcon className="w-4 h-4" />
												)
											}
											onClick={handleSaveEvent}
											isDisabled={isSaving || isCheckingSaved}
											py={2.5}
											px={4}
											_hover={{ bg: "#F3F4F6" }}
											fontSize="sm"
											fontWeight="500"
											color="#1F2937"
										>
											{isCheckingSaved
												? "Loading..."
												: isSaving
												? isSaved
													? "Unsaving..."
													: "Saving..."
												: isSaved
												? "Unsave Event"
												: "Save Event"}
										</MenuItem>
										<MenuItem 
											icon={<ShareIcon className="w-4 h-4" />}
											onClick={async () => {
												try {
													const eventUrl = `${window.location.origin}/${clonedEvent?.slug || ''}`
													await navigator.clipboard.writeText(eventUrl)
													toast({
														title: "Link copied!",
														description: "Event link has been copied to clipboard",
														status: "success",
														duration: 2000,
														isClosable: true,
													})
												} catch (error) {
													toast({
														title: "Failed to copy link",
														description: "Please try again",
														status: "error",
														duration: 2000,
														isClosable: true,
													})
												}
											}}
											py={2.5}
											px={4}
											_hover={{ bg: "#F3F4F6" }}
											fontSize="sm"
											fontWeight="500"
											color="#1F2937"
										>
											Copy Link
										</MenuItem>
										<MenuDivider borderColor="#E5E7EB" />
										<MenuItem 
											color="#DC2626"
											icon={<EllipsisHorizontalIcon className="w-4 h-4" />}
											onClick={() => setIsReportModalOpen(true)}
											py={2.5}
											px={4}
											_hover={{ bg: "#FEF2F2" }}
											fontSize="sm"
											fontWeight="500"
										>
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
					{/* About Details (Description) - Moved here */}
					<div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
						<h2 className="text-xl font-bold text-[#1C1E21] mb-4">About</h2>
						<div className="flex items-start gap-4 mb-4">
							<UserGroupIcon className="w-6 h-6 text-gray-500 mt-1" />
							<div>
								<p className="text-[#1C1E21]">
									{clonedEvent.privacy === 'private' ? 'Private - Only people who are invited' : 'Public - Anyone on Jetzy'}
								</p>
							</div>
						</div>
						<div className="space-y-4 text-[#1C1E21]">
							<EventDescription description={clonedEvent.desc} />
						</div>

						{/* Host Information */}
						{clonedEvent.host && clonedEvent.host.name && clonedEvent.host.name.trim() !== "" && (
							<div className="mt-6 pt-6 border-t border-gray-200">
								<h3 className="text-lg font-semibold text-[#1C1E21] mb-4">Host Information</h3>
								<Flex align="center" gap={4} mb={3}>
									{clonedEvent.host.image ? (
										<Avatar src={clonedEvent.host.image} name={clonedEvent.host.name} size="md" />
									) : (
										<Avatar name={clonedEvent.host.name} size="md" bgGradient="linear(to-br, purple.400, purple.600)" color="white" />
									)}
									<Box>
										<Text fontSize="md" fontWeight="semibold" color="#1C1E21" noOfLines={2} title={clonedEvent.host.name}>
											{clonedEvent.host.name}
										</Text>
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

					{/* Discussion and Chat Tabs */}
					<div className="bg-white rounded-lg shadow-sm border border-gray-200">
						<Tabs 
							index={activeTabIndex} 
							onChange={(index) => {
								// If user tries to access Chat tab (index 1) and is not logged in
								if (index === 1 && !session) {
									// Redirect to login page with callback URL
									const currentUrl = router.asPath
									router.push(`${ROUTES.login}?_cb=${encodeURIComponent(currentUrl)}`)
									return
								}
								setActiveTabIndex(index)
							}}
							colorScheme="blue"
						>
							<TabList borderBottom="1px" borderColor="gray.200" px={4} pt={4}>
								<Tab 
									_selected={{ color: "#1877F2", borderBottomColor: "#1877F2" }}
									fontWeight="medium"
									px={6}
									py={3}
								>
									Discussion
								</Tab>
								<Tab 
									_selected={{ color: "#1877F2", borderBottomColor: "#1877F2" }}
									fontWeight="medium"
									px={6}
									py={3}
								>
									Chat
								</Tab>
							</TabList>

							<TabPanels>
								<TabPanel px={0} py={0}>
									<DiscussionBoard eventId={clonedEvent._id.toString()} />
								</TabPanel>
								<TabPanel px={0} py={0}>
									{session ? (
										<JetzyChatIntegration 
											eventId={clonedEvent._id.toString()} 
											eventName={clonedEvent.name}
										/>
									) : (
										<Box p={8} textAlign="center">
											<Text fontSize="lg" fontWeight="bold" color="#1C1E21" mb={2}>
												Login Required
											</Text>
											<Text color="#65676B" mb={4}>
												Please login to access the chat.
											</Text>
											<Button
												onClick={() => {
													const currentUrl = router.asPath
													router.push(`${ROUTES.login}?_cb=${encodeURIComponent(currentUrl)}`)
												}}
												bg="#1877F2"
												color="white"
												_hover={{ bg: "#166FE5" }}
											>
												Login
											</Button>
										</Box>
									)}
								</TabPanel>
							</TabPanels>
						</Tabs>
					</div>
				</div>

				{/* Right Column (Sidebar) */}
				<div className="space-y-4">
					{/* Location Card */}
					{clonedEvent.location && (
						<div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
							<h2 className="text-xl font-bold text-[#1C1E21] mb-4">Location</h2>
							{clonedEvent.location.trim() && (
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
							)}
							<div className="flex items-start gap-3">
								<MapPinIcon className="w-6 h-6 text-gray-500 flex-shrink-0" />
								<div>
									{clonedEvent.venueName && (
										<p className="font-semibold text-[#1C1E21] mb-1">{clonedEvent.venueName}</p>
									)}
									<p className={`text-[#1C1E21] ${clonedEvent.venueName ? 'text-sm text-gray-600' : 'font-semibold'}`}>{clonedEvent.location}</p>
								</div>
							</div>
						</div>
					)}

					{/* Sticky Ticket Card (Desktop) */}
					<div className="bg-white rounded-lg shadow-lg p-6 border-2 border-blue-200 sticky top-20 transform transition-all duration-300 hover:shadow-2xl">
						<div className="text-center">
							<p className="text-gray-500 text-sm mb-2 font-semibold">Tickets starting from</p>
							<p className="text-4xl font-extrabold text-[#1C1E21] mb-6">
								{(() => {
									const enabledTickets = clonedEvent.tickets?.filter((t: any) => !t.disabled) || []
									if (enabledTickets.length > 0) {
										// Only consider paid tickets (price > 0) for the minimum price display
										const paidTickets = enabledTickets.filter((t: any) => t.price > 0)
										if (paidTickets.length > 0) {
											return `$${Math.min(...paidTickets.map((t: any) => t.price))}`
										}
										// If all tickets are free, show "Free"
										return 'Free'
									}
									// Fallback: check all tickets if enabledTickets is empty
									const allTickets = clonedEvent.tickets || []
									const paidTickets = allTickets.filter((t: any) => t.price > 0)
									if (paidTickets.length > 0) {
										return `$${Math.min(...paidTickets.map((t: any) => t.price))}`
									}
									return allTickets.length > 0 ? 'Free' : 'Free'
								})()}
							</p>
							<button
								onClick={() => setIsTicketModalOpen(true)}
								disabled={hasEventEnded}
								className={`relative w-full py-5 px-6 rounded-xl font-extrabold text-xl text-white transition-all duration-300 shadow-xl hover:shadow-2xl flex items-center justify-center gap-3 transform hover:scale-105 active:scale-95 ${hasEventEnded ? "bg-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-800 hover:to-blue-900"
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
							
							{/* All Tickets List */}
							{clonedEvent.tickets && clonedEvent.tickets.length > 0 && (
								<div className="mt-6 pt-6 border-t border-gray-200">
									<p className="text-sm font-semibold text-gray-700 mb-3 text-left">Available Tickets</p>
									<div className="space-y-2 max-h-[300px] overflow-y-auto">
										{clonedEvent.tickets.map((ticket: any, index: number) => {
											const isDisabled = ticket.disabled || false
											return (
												<div
													key={ticket._id?.toString() || index}
													className={`p-3 rounded-lg border-2 transition-all ${
														isDisabled
															? "bg-gray-100 border-gray-300 opacity-60 cursor-not-allowed"
															: "bg-gray-50 border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer"
													}`}
													onClick={() => !isDisabled && !hasEventEnded && setIsTicketModalOpen(true)}
												>
													<div className="flex items-center justify-between">
														<div className="flex-1">
															<div className="flex items-center gap-2">
																<p className={`font-semibold text-sm ${isDisabled ? "text-gray-500 line-through" : "text-gray-900"}`}>
																	{ticket.name}
																</p>
																{isDisabled && (
																	<span className="px-2 py-0.5 bg-gray-400 text-white text-xs font-semibold rounded-full">
																		No longer available
																	</span>
																)}
															</div>
															{ticket.desc && (
																<p className={`text-xs mt-1 ${isDisabled ? "text-gray-400" : "text-gray-600"}`}>
																	{ticket.desc}
																</p>
															)}
														</div>
														<p className={`font-bold text-lg ml-3 ${isDisabled ? "text-gray-400 line-through" : "text-blue-600"}`}>
															${ticket.price}
														</p>
													</div>
												</div>
											)
										})}
									</div>
								</div>
							)}
						</div>
					</div>



					{/* Hosted By - Show only if host name exists and no host info in about section */}
					{clonedEvent.host && clonedEvent.host.name && clonedEvent.host.name.trim() !== "" && (!clonedEvent.host.email && !clonedEvent.host.phone) && (
						<div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
							<h2 className="text-xl font-bold text-[#1C1E21] mb-4">Hosted by</h2>
							<Flex align="center" gap={3}>
								{clonedEvent.host.image ? (
									<Avatar src={clonedEvent.host.image} name={clonedEvent.host.name} size="md" />
								) : (
									<Avatar name={clonedEvent.host.name} size="md" bgGradient="linear(to-br, purple.400, purple.600)" color="white" />
								)}
								<Box>
									<Text fontSize="md" fontWeight="semibold" color="#1C1E21" noOfLines={2} title={clonedEvent.host.name}>
										{clonedEvent.host.name}
									</Text>
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

					{/* Guests Section */}
					<EventGuests eventId={clonedEvent._id.toString()} showParticipants={clonedEvent.showParticipants} />
				</div>
			</div>

			<Footer />

			{/* Ticket Modal */}
			{clonedEvent && <EventTicketsComponent event={clonedEvent} isOpen={isTicketModalOpen} onClose={() => setIsTicketModalOpen(false)} />}

			{/* Checkout Modal */}
			{clonedEvent?.name && <EventCheckoutModel event={clonedEvent.name} />}

			{/* Report Event Modal */}
			<Modal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} isCentered>
				<ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
				<ModalContent bg="white" color="#1F2937" mx={{ base: 4, md: 0 }} borderRadius="2xl" border="1px solid #E5E7EB" boxShadow="xl">
					<ModalHeader fontSize={{ base: "lg", md: "xl" }} borderBottom="1px solid #E5E7EB" pb={4}>
						Report Event
					</ModalHeader>
					<ModalCloseButton color="#6B7280" _hover={{ bg: "#F3F4F6" }} />
					<ModalBody pb={6} pt={6}>
						<div className="flex flex-col gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">Reason for reporting</label>
								<Select
									value={reportReason}
									onChange={(e) => setReportReason(e.target.value)}
									placeholder="Select a reason"
									border="1px solid #E5E7EB"
									_hover={{ borderColor: "#D1D5DB" }}
									_focus={{ borderColor: "#8B5CF6", boxShadow: "0 0 0 1px #8B5CF6" }}
								>
									<option value="spam">Spam or Scam</option>
									<option value="inappropriate">Inappropriate Content</option>
									<option value="misleading">Misleading Information</option>
									<option value="harassment">Harassment or Bullying</option>
									<option value="fake">Fake Event</option>
									<option value="other">Other</option>
								</Select>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">Additional details (optional)</label>
								<textarea
									value={reportDescription}
									onChange={(e) => setReportDescription(e.target.value)}
									placeholder="Please provide any additional information..."
									rows={4}
									className="w-full p-3 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none"
								/>
							</div>
						</div>
					</ModalBody>
					<ModalFooter borderTop="1px solid #E5E7EB" pt={4}>
						<Button
							variant="ghost"
							mr={3}
							onClick={() => {
								setIsReportModalOpen(false)
								setReportReason("")
								setReportDescription("")
							}}
							_hover={{ bg: "#F3F4F6" }}
						>
							Cancel
						</Button>
						<Button
							bg="#DC2626"
							color="white"
							_hover={{ bg: "#B91C1C" }}
							isLoading={isSubmittingReport}
							onClick={async () => {
								if (!reportReason) {
									toast({
										title: "Please select a reason",
										status: "warning",
										duration: 2000,
										isClosable: true,
									})
									return
								}

								setIsSubmittingReport(true)
								try {
									const response = await axios.post("/api/events/report", {
										eventId: clonedEvent?._id,
										reason: reportReason,
										description: reportDescription,
									})

									if (response.data.status) {
										toast({
											title: "Report submitted",
											description: "Thank you for reporting this event. We will review it shortly.",
											status: "success",
											duration: 3000,
											isClosable: true,
										})
										setIsReportModalOpen(false)
										setReportReason("")
										setReportDescription("")
									} else {
										throw new Error(response.data.message || "Failed to submit report")
									}
								} catch (error: any) {
									toast({
										title: "Failed to submit report",
										description: error.response?.data?.message || error.message || "Please try again later",
										status: "error",
										duration: 3000,
										isClosable: true,
									})
								} finally {
									setIsSubmittingReport(false)
								}
							}}
						>
							Submit Report
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
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
	
	return (
		<SafeHTML
			html={description}
			className="text-base text-gray-800 break-words leading-relaxed prose prose-sm max-w-none"
			style={{
				lineHeight: "1.6",
			}}
		/>
	)
}

interface TicketInfo {
	ticketId: string
	quantity: number
	_id: string
}

interface Booking {
	stripeSessionId?: string
	paymentUrl?: string | null
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
	const [isCreatingPaymentLink, setIsCreatingPaymentLink] = useState(false)
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
								bookings.data.map((booking: Booking) => {
									// Debug: Log booking details
									if (booking.status === "pending") {
										console.log("[EventBookings] Pending booking:", {
											bookingId: booking._id,
											status: booking.status,
											hasPaymentUrl: !!booking.paymentUrl,
											paymentUrl: booking.paymentUrl,
											hasStripeSessionId: !!(booking as any).stripeSessionId,
										})
									}
									return (
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
														booking.status === "pending" ? "yellow" :
														booking.status === "failed" || booking.status === "cancelled" ? "red" : "gray"
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
													{booking.status === "pending" && (
														<>
															<MenuItem onClick={async (e) => {
																e.preventDefault()
																e.stopPropagation()
																try {
																	let paymentUrl = booking.paymentUrl
																	
																	// If paymentUrl is not available but stripeSessionId exists, fetch it
																	if (!paymentUrl && (booking as any).stripeSessionId) {
																		toast({
																			title: "Fetching payment link...",
																			status: "info",
																			duration: 2000,
																			isClosable: true,
																		})
																		const response = await axios.get(`/api/bookings/payment-url?sessionId=${(booking as any).stripeSessionId}`)
																		paymentUrl = response.data?.data?.paymentUrl
																	}
																	
																	if (!paymentUrl) {
																		// Try to get payment URL from booking reference
																		try {
																			const response = await axios.get(`/api/bookings/payment-url-by-booking?bookingRef=${booking.bookingRef}`)
																			if (response.data?.data?.paymentUrl) {
																				paymentUrl = response.data.data.paymentUrl
																			}
																		} catch (fallbackError: any) {
																			// Silently handle 404 or other errors - don't log to console
																			// The error will be handled by the outer catch block
																			if (fallbackError?.response?.status !== 404) {
																				console.log("[EventBookings] Could not retrieve payment URL from booking reference:", fallbackError?.response?.status || fallbackError?.message)
																			}
																		}
																	}
																	
																	if (!paymentUrl) {
																		// Show a user-friendly error message
																		throw new Error("Payment link is not available for this booking. The payment session may have expired or the booking was created through a different method. Please contact support if you need assistance.")
																	}
																	
																	await navigator.clipboard.writeText(paymentUrl)
																	toast({
																		title: "Payment link copied!",
																		status: "success",
																		duration: 2000,
																		isClosable: true,
																	})
																} catch (error: any) {
																	// Only log non-user-facing errors
																	if (error?.response?.status !== 404 && !error?.message?.includes("Payment link is not available")) {
																		console.error("Error copying payment link:", error)
																	}
																	
																	// Show user-friendly error message
																	const errorMessage = error?.response?.data?.message || error?.message || "Could not retrieve payment link"
																	toast({
																		title: "Payment Link Unavailable",
																		description: errorMessage,
																		status: "warning",
																		duration: 5000,
																		isClosable: true,
																	})
																}
															}}>
																Copy Payment Link
															</MenuItem>
															<MenuItem onClick={async (e) => {
																e.preventDefault()
																e.stopPropagation()
																setIsCreatingPaymentLink(true)
																try {
																	toast({
																		title: "Creating new payment link...",
																		status: "info",
																		duration: 2000,
																		isClosable: true,
																	})
																	
																	const response = await axios.post(`/api/bookings/create-payment-link`, {
																		bookingId: booking._id,
																		sendEmail: false
																	})
																	
																	if (response.data?.status && response.data?.data?.paymentUrl) {
																		const newPaymentUrl = response.data.data.paymentUrl
																		
																		// Auto-copy the new link
																		try {
																			await navigator.clipboard.writeText(newPaymentUrl)
																		} catch (clipboardError) {
																			// Clipboard permission denied - non-critical
																			console.warn("Failed to copy to clipboard:", clipboardError)
																		}
																		toast({
																			title: "New payment link created and copied!",
																			status: "success",
																			duration: 3000,
																			isClosable: true,
																		})
																		
																		// Refresh the bookings data
																		queryClient.invalidateQueries({ queryKey: ["eventBookings", eventId] })
																	} else {
																		throw new Error(response.data?.message || "Failed to create payment link")
																	}
																} catch (error: any) {
																	console.error("Error creating new payment link:", error)
																	console.error("Error response data:", error?.response?.data)
																	const errorMessage = error?.response?.data?.message || error?.message || "Failed to create payment link"
																	
																	// Use setTimeout to ensure toast is called after error handling completes
																	setTimeout(() => {
																		try {
																			toast({
																				title: error?.response?.status === 400 ? "Cannot Create Payment Link" : "Error",
																				description: errorMessage,
																				status: "error",
																				duration: 10000,
																				isClosable: true,
																			})
																		} catch (toastError) {
																			console.error("Failed to show toast:", toastError)
																			// Fallback: use alert if toast fails
																			alert(`Error: ${errorMessage}`)
																		}
																	}, 100)
																} finally {
																	setIsCreatingPaymentLink(false)
																}
															}}>
																Create New Payment Link
															</MenuItem>
															<MenuItem onClick={async (e) => {
																e.preventDefault()
																e.stopPropagation()
																setIsCreatingPaymentLink(true)
																try {
																	toast({
																		title: "Creating payment link and sending email...",
																		status: "info",
																		duration: 2000,
																		isClosable: true,
																	})
																	
																	const response = await axios.post(`/api/bookings/create-payment-link`, {
																		bookingId: booking._id,
																		sendEmail: true
																	})
																	
																	if (response.data?.status && response.data?.data?.paymentUrl) {
																		const emailSent = response.data.data.emailSent
																		
																		toast({
																			title: emailSent ? "Payment link created and email sent!" : "Payment link created (email failed)",
																			description: emailSent 
																				? `Payment link has been sent to ${booking.customerEmail}` 
																				: "Payment link was created but email could not be sent. Link has been copied to clipboard.",
																			status: emailSent ? "success" : "warning",
																			duration: 5000,
																			isClosable: true,
																		})
																		
																		// Copy link to clipboard even if email was sent
																		if (response.data.data.paymentUrl) {
																			try {
																				await navigator.clipboard.writeText(response.data.data.paymentUrl)
																			} catch (clipboardError) {
																				// Clipboard permission denied - non-critical, just log
																				console.warn("Failed to copy to clipboard:", clipboardError)
																			}
																		}
																		
																		// Refresh the bookings data
																		queryClient.invalidateQueries({ queryKey: ["eventBookings", eventId] })
																	} else {
																		throw new Error(response.data?.message || "Failed to create payment link")
																	}
																} catch (error: any) {
																	console.error("Error creating and sending payment link:", error)
																	console.error("Error response data:", error?.response?.data)
																	const errorMessage = error?.response?.data?.message || error?.message || "Failed to create payment link"
																	
																	// Note: Next.js error overlay in dev mode is normal - toast will still show
																	toast({
																		title: error?.response?.status === 400 ? "Cannot Create Payment Link" : "Error",
																		description: errorMessage,
																		status: "error",
																		duration: 10000,
																		isClosable: true,
																	})
																} finally {
																	setIsCreatingPaymentLink(false)
																}
															}}>
																Create & Send Payment Link via Email
															</MenuItem>
														</>
													)}
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
									)
								})
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
														selectedBooking.status === "pending" ? "yellow" :
														selectedBooking.status === "failed" || selectedBooking.status === "cancelled" ? "red" : "gray"
												}
											>
												{selectedBooking.status}
											</Badge>
										</Flex>
										{selectedBooking.status === "pending" && (
											<Box>
												<Text fontWeight="semibold" mb={2}>Payment Link:</Text>
												<Flex direction="column" gap={2}>
													{selectedBooking.paymentUrl && (
														<Text fontSize="xs" fontFamily="mono" color="gray.600" wordBreak="break-all">
															{selectedBooking.paymentUrl}
														</Text>
													)}
													<Flex gap={2} flexWrap="wrap">
													<Button
														size="xs"
														colorScheme="blue"
														onClick={async () => {
															try {
																let paymentUrl = selectedBooking.paymentUrl
																let isExpired = false
																
																// If paymentUrl is not available but stripeSessionId exists, fetch it
																if (!paymentUrl && selectedBooking.stripeSessionId) {
																	toast({
																		title: "Fetching payment link...",
																		status: "info",
																		duration: 2000,
																		isClosable: true,
																	})
																	try {
																		const response = await axios.get(`/api/bookings/payment-url?sessionId=${selectedBooking.stripeSessionId}`)
																		paymentUrl = response.data?.data?.paymentUrl
																		// Update selectedBooking state with fetched paymentUrl
																		if (paymentUrl) {
																			setSelectedBooking({ ...selectedBooking, paymentUrl })
																		}
																	} catch (fetchError: any) {
																		// Check if error indicates expiration
																		if (fetchError?.response?.data?.message?.includes("expired")) {
																			isExpired = true
																		}
																	}
																}
																
																if (!paymentUrl && !isExpired) {
																	// Try to get payment URL from booking reference
																	try {
																		const response = await axios.get(`/api/bookings/payment-url-by-booking?bookingRef=${selectedBooking.bookingRef}`)
																		if (response.data?.data?.paymentUrl) {
																			paymentUrl = response.data.data.paymentUrl
																			// Update selectedBooking state with fetched paymentUrl
																			setSelectedBooking({ ...selectedBooking, paymentUrl })
																		}
																	} catch (fallbackError: any) {
																		// Check if error indicates expiration
																		if (fallbackError?.response?.data?.message?.includes("expired")) {
																			isExpired = true
																		}
																		// Silently handle 404 or other errors - don't log to console
																		if (fallbackError?.response?.status !== 404 && !isExpired) {
																			console.log("[EventBookings] Could not retrieve payment URL from booking reference:", fallbackError?.response?.status || fallbackError?.message)
																		}
																	}
																}
																
																if (!paymentUrl && !isExpired) {
																	throw new Error("Payment link is not available for this booking. The payment session may have expired or the booking was created through a different method.")
																}
																
																if (isExpired || !paymentUrl) {
																	throw new Error("EXPIRED")
																}
																
																await navigator.clipboard.writeText(paymentUrl)
																toast({
																	title: "Payment link copied!",
																	status: "success",
																	duration: 2000,
																	isClosable: true,
																})
															} catch (error: any) {
																// Check if error indicates expiration
																const isExpired = error?.message === "EXPIRED" || 
																	error?.response?.data?.message?.includes("expired") ||
																	error?.message?.includes("expired")
																
																if (isExpired) {
																	// Show option to create new link
																	toast({
																		title: "Payment Link Expired",
																		description: "The payment link has expired. Please create a new payment link.",
																		status: "warning",
																		duration: 5000,
																		isClosable: true,
																	})
																	// Don't show error, user will see "Create New Link" button
																	return
																}
																
																// Only log non-user-facing errors
																if (error?.response?.status !== 404 && !error?.message?.includes("Payment link is not available")) {
																	console.error("Error copying payment link:", error)
																}
																
																// Show user-friendly error message
																const errorMessage = error?.response?.data?.message || error?.message || "Could not retrieve payment link"
																toast({
																	title: "Payment Link Unavailable",
																	description: errorMessage,
																	status: "warning",
																	duration: 5000,
																	isClosable: true,
																})
															}
														}}
													>
														Copy
													</Button>
													<Button
														size="xs"
														colorScheme="green"
														isLoading={isCreatingPaymentLink}
														onClick={async () => {
															setIsCreatingPaymentLink(true)
															try {
																toast({
																	title: "Creating new payment link...",
																	status: "info",
																	duration: 2000,
																	isClosable: true,
																})
																
																const response = await axios.post(`/api/bookings/create-payment-link`, {
																	bookingId: selectedBooking._id,
																	sendEmail: false
																})
																
																if (response.data?.status && response.data?.data?.paymentUrl) {
																	const newPaymentUrl = response.data.data.paymentUrl
																	setSelectedBooking({ 
																		...selectedBooking, 
																		paymentUrl: newPaymentUrl,
																		stripeSessionId: response.data.data.sessionId || selectedBooking.stripeSessionId
																	})
																	
																	// Auto-copy the new link
																	await navigator.clipboard.writeText(newPaymentUrl)
																	toast({
																		title: "New payment link created and copied!",
																		status: "success",
																		duration: 3000,
																		isClosable: true,
																	})
																} else {
																	throw new Error(response.data?.message || "Failed to create payment link")
																}
															} catch (error: any) {
																console.error("Error creating new payment link:", error)
																console.error("Error response data:", error?.response?.data)
																const errorMessage = error?.response?.data?.message || error?.message || "Failed to create payment link"
																
																// Use setTimeout to ensure toast is called after error handling completes
																setTimeout(() => {
																	try {
																		toast({
																			title: error?.response?.status === 400 ? "Cannot Create Payment Link" : "Error",
																			description: errorMessage,
																			status: "error",
																			duration: 10000,
																			isClosable: true,
																		})
																	} catch (toastError) {
																		console.error("Failed to show toast:", toastError)
																		// Fallback: use alert if toast fails
																		alert(`Error: ${errorMessage}`)
																	}
																}, 100)
															} finally {
																setIsCreatingPaymentLink(false)
															}
														}}
													>
														Create New Link
													</Button>
													<Button
														size="xs"
														colorScheme="purple"
														isLoading={isCreatingPaymentLink}
														onClick={async () => {
															setIsCreatingPaymentLink(true)
															try {
																toast({
																	title: "Creating payment link and sending email...",
																	status: "info",
																	duration: 2000,
																	isClosable: true,
																})
																
																const response = await axios.post(`/api/bookings/create-payment-link`, {
																	bookingId: selectedBooking._id,
																	sendEmail: true
																})
																
																if (response.data?.status && response.data?.data?.paymentUrl) {
																	const emailSent = response.data.data.emailSent
																	const newPaymentUrl = response.data.data.paymentUrl
																	
																	setSelectedBooking({ 
																		...selectedBooking, 
																		paymentUrl: newPaymentUrl,
																		stripeSessionId: response.data.data.sessionId || selectedBooking.stripeSessionId
																	})
																	
																	toast({
																		title: emailSent ? "Payment link created and email sent!" : "Payment link created (email failed)",
																		description: emailSent 
																			? `Payment link has been sent to ${selectedBooking.customerEmail}` 
																			: "Payment link was created but email could not be sent. Link has been copied to clipboard.",
																		status: emailSent ? "success" : "warning",
																		duration: 5000,
																		isClosable: true,
																	})
																	
																	// Copy link to clipboard even if email was sent
																	try {
																		await navigator.clipboard.writeText(newPaymentUrl)
																	} catch (clipboardError) {
																		// Clipboard permission denied - non-critical
																		console.warn("Failed to copy to clipboard:", clipboardError)
																	}
																} else {
																	throw new Error(response.data?.message || "Failed to create payment link")
																}
															} catch (error: any) {
																console.error("Error creating and sending payment link:", error)
																console.error("Error response data:", error?.response?.data)
																const errorMessage = error?.response?.data?.message || error?.message || "Failed to create payment link"
																
																// Use setTimeout to ensure toast is called after error handling completes
																setTimeout(() => {
																	try {
																		toast({
																			title: error?.response?.status === 400 ? "Cannot Create Payment Link" : "Error",
																			description: errorMessage,
																			status: "error",
																			duration: 10000,
																			isClosable: true,
																		})
																	} catch (toastError) {
																		console.error("Failed to show toast:", toastError)
																		// Fallback: use alert if toast fails
																		alert(`Error: ${errorMessage}`)
																	}
																}, 100)
															} finally {
																setIsCreatingPaymentLink(false)
															}
														}}
													>
														Create & Send Email
													</Button>
													</Flex>
												</Flex>
											</Box>
										)}
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
													<Box>
														<SafeHTML html={eventData.data.data.name} />
													</Box>
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
													const eventTicket = eventData.data.data.tickets?.find((t: any) => {
														if (!t || !t._id) return false
														
														// Normalize both IDs to strings for comparison
														const bookingTicketIdStr = (ticket.ticketId?.toString?.() || String(ticket.ticketId)).trim()
														const eventTicketIdStr = (t._id?.toString?.() || String(t._id)).trim()
														
														// Compare normalized strings (handles both ObjectId and string)
														return eventTicketIdStr === bookingTicketIdStr
													})
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
