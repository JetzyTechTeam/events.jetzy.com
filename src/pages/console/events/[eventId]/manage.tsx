"use client"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { adminOnly } from "@/lib/authSession"
import { stripHTMLAndDecode } from "@/lib/helpers"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"
import { Events } from "@/models/events"
import { GetServerSideProps } from "next"
import React, { useState, useEffect } from "react"
import { DateTime } from "luxon"
import Head from "next/head"
import { useRouter } from "next/router"
import { Roles } from "@/types"
import { useSession } from "next-auth/react"
import { 
	FiCalendar, 
	FiMapPin, 
	FiMail, 
	FiUserPlus, 
	FiSend, 
	FiShare2, 
	FiEdit, 
	FiCheckCircle, 
	FiUsers, 
	FiClock,
	FiGlobe,
	FiMoreHorizontal,
	FiShoppingCart,
	FiTrendingUp
} from "react-icons/fi"
import Image from "next/image"
import { SendBlastModal } from "@/components/console/SendBlastModal"
import { InviteGuestsModal } from "@/components/console/InviteGuestsModal"
import { ShareModal } from "@/components/console/ShareModal"
import { GuestsList } from "@/components/console/GuestsList"
import { WaitingList } from "@/components/console/WaitingList"
import { EventBookings } from "@/components/HostedEvents"
import DiscussionBoard from "@/components/events/DiscussionBoard"
import JetzyChatIntegration from "@/components/events/JetzyChatIntegration"
import MarketingTab from "@/components/console/MarketingTab"
import { ReferralCodesManager } from "@/components/console/ReferralCodesManager"
import { Box, Flex, Text, Button, Avatar, IconButton, Menu, MenuButton, MenuList, MenuItem, Divider, Badge, AvatarGroup } from "@chakra-ui/react"
import SafeHTML from "@/components/misc/SafeHTML"

// Hardcoded presenter - shown when no presentedBy in database
const defaultPresenter = { name: "Jetzy Community", logo: null }

// Hardcoded hosts - shown when no hostedBy in database
const defaultHosts = [
	{ name: "Host 1", image: null },
	{ name: "Host 2", image: null },
	{ name: "Host 3", image: null },
	{ name: "Host 4", image: null },
	{ name: "Host 5", image: null },
]

export default function Manage({ event }: any) {
	const eventData = JSON.parse(event)
	const [shareModal, setShareModal] = useState(false)
	const [inviteGuestsModal, setInviteGuestsModal] = useState(false)
	const [sendBlastModal, setSendBlastModal] = useState(false)
	const router = useRouter()
	const { data: session } = useSession()

	// Determine if user is admin
	const isAdmin = (session?.user as any)?.role === "admin" || (session?.user as any)?.role === "super admin"
	
	// Define tabs based on user role
	const allTabs = [
		{ label: "About", value: "about" },
		{ label: "Marketing", value: "marketing" },
		{ label: "Discussion", value: "discussion" },
		{ label: "Chat", value: "chat" },
		...(isAdmin ? [
			{ label: "Bookings", value: "bookings" },
			{ label: "Guests", value: "guests" },
			{ label: "Waiting List", value: "waitingList" },
			{ label: "Referral Codes", value: "referralCodes" }
		] : [])
	]
	
	// Ensure initial tab is valid for non-admin users
	const validTabs = allTabs.map(t => t.value)
	const [activeTab, setActiveTab] = useState<"about" | "guests" | "bookings" | "waitingList" | "referralCodes" | "discussion" | "marketing" | "chat">(
		validTabs.includes("about") ? "about" : (validTabs[0] as any)
	)
	
	// Validate activeTab when role changes
	useEffect(() => {
		if (!validTabs.includes(activeTab)) {
			setActiveTab(validTabs[0] as any)
		}
	}, [isAdmin])

	const eventDate = DateTime.fromISO(eventData.startsOn).toLocal()
	const endDate = DateTime.fromISO(eventData.endsOn).toLocal()
	const formattedDate = eventDate.toFormat("EEEE, MMMM d, yyyy")
	const formattedTime = `${eventDate.toFormat("t")} - ${endDate.toFormat("t")}`
	const month = eventDate.toFormat("MMM").toUpperCase()
	const day = eventDate.toFormat("d")

	return (
		<>
			<Head>
				<title>{stripHTMLAndDecode(eventData.name)} - Jetzy Events</title>
				<meta name="description" content={`Manage ${stripHTMLAndDecode(eventData.name)}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			
			<ConsoleLayout page={undefined} backBtn="/console/events" maxW="100%">
				{/* MODALS */}
				{isAdmin && (
					<>
						<InviteGuestsModal inviteGuestsModal={inviteGuestsModal} setInviteGuestsModal={setInviteGuestsModal} event={eventData} />
						<SendBlastModal sendBlastModal={sendBlastModal} setSendBlastModal={setSendBlastModal} event={eventData} />
						<ShareModal shareModal={shareModal} setShareModal={setShareModal} eventSlug={eventData.slug} />
					</>
				)}

				{/* FACEBOOK STYLE COVER */}
				<Box bg="white" boxShadow="sm" pb={4} mb={6} mx={{ base: -4, md: -6, lg: -8 }} mt={{ base: -6, md: -8 }}>
					{/* Cover Image Container */}
					<Box 
						w="full" 
						h={{ base: "200px", md: "350px", lg: "400px" }} 
						position="relative" 
						bg="gray.100"
						borderBottomRadius={{ base: "0", md: "lg" }}
						overflow="hidden"
						maxW="1250px"
						mx="auto"
					>
						{eventData.images && eventData.images.length > 0 ? (
							<Image 
								src={eventData.images[0]} 
								alt={eventData.name} 
								fill 
								className="object-cover" 
								priority
							/>
						) : (
							<Flex w="full" h="full" align="center" justify="center" bg="gray.200">
								<FiUsers size={48} color="gray" />
							</Flex>
						)}
						
						{/* Edit Cover Button (Visual Only) */}
						<Button 
							position="absolute" 
							bottom="4" 
							right="4" 
							bg="white" 
							color="black" 
							size="sm" 
							leftIcon={<FiEdit />}
							_hover={{ bg: "gray.100" }}
							onClick={() => router.push(`/console/events/${eventData._id}/update`)}
						>
							Edit
						</Button>
					</Box>

					{/* Event Header Info */}
					<Box maxW="1250px" mx="auto" px={{ base: 4, md: 8 }} pt={6}>
						<Flex direction="column" gap={4}>
							<Flex justify="space-between" align="flex-start" direction={{ base: "column", md: "row" }} gap={4}>
								<Box>
									<Text 
										color="#D93025" 
										fontWeight="bold" 
										fontSize="sm" 
										textTransform="uppercase"
										letterSpacing="wide"
									>
										{formattedDate} AT {eventDate.toFormat("t")}
									</Text>
									<Box 
										fontSize={{ base: "2xl", md: "4xl" }} 
										fontWeight="800" 
										color="#1C1E21" 
										lineHeight="1.2"
										mb={1}
									>
										<SafeHTML html={eventData.name} />
									</Box>
									<Text color="#65676B" fontSize="md">
										{eventData.location}
									</Text>
								</Box>
								
								{/* Check-in / Ticket Actions */}
								<Flex gap={2}>
									{isAdmin && (
										<Button 
											bg="#E4E6EB" 
											color="#1C1E21" 
											_hover={{ bg: "#D8DADF" }}
											leftIcon={<FiCheckCircle />}
											onClick={() => router.push(`/console/events/${eventData._id}/check-in`)}
										>
											Check-In
										</Button>
									)}
									<Menu>
										<MenuButton as={Button} bg="#E4E6EB" px={3} _hover={{ bg: "#D8DADF" }}>
											<FiMoreHorizontal />
										</MenuButton>
										<MenuList zIndex={20}>
											<MenuItem icon={<FiEdit />} onClick={() => router.push(`/console/events/${eventData._id}/update`)}>Edit Event</MenuItem>
											{isAdmin && (
												<>
													<MenuItem icon={<FiTrendingUp />} onClick={() => router.push(`/console/events/${eventData._id}/analytics`)}>Analytics</MenuItem>
													<MenuItem icon={<FiShare2 />} onClick={() => setShareModal(true)}>Share</MenuItem>
												</>
											)}
										</MenuList>
									</Menu>
								</Flex>
							</Flex>

							<Divider borderColor="#CED0D4" my={2} />

							{/* Action Bar */}
							<Flex justify="space-between" align="center" wrap="wrap" gap={4}>
								<Flex gap={1} overflowX="auto" pb={1} sx={{ '::-webkit-scrollbar': { display: 'none' } }}>
									{allTabs.map((tab) => (
										<Button
											key={tab.value}
											variant="ghost"
											color={activeTab === tab.value ? "#1877F2" : "#65676B"}
											borderBottom={activeTab === tab.value ? "3px solid #1877F2" : "3px solid transparent"}
											borderRadius="0"
											px={4}
											h="50px"
											_hover={{ bg: "#F0F2F5", borderRadius: "md", borderBottom: "3px solid transparent" }}
											onClick={() => setActiveTab(tab.value as any)}
											fontSize="md"
											fontWeight="600"
										>
											{tab.label}
										</Button>
									))}
								</Flex>
								
								<Flex gap={2}>
									<Button 
										bg="#10B981" 
										color="white" 
										_hover={{ bg: "#059669" }}
										leftIcon={<FiShoppingCart />}
										onClick={() => router.push(`/${eventData.slug}`)}
										size="sm"
										px={6}
									>
										Get Ticket
									</Button>
									{isAdmin && (
										<>
											<Button 
												bg="#1877F2" 
												color="white" 
												_hover={{ bg: "#166FE5" }}
												leftIcon={<FiUserPlus />}
												onClick={() => setInviteGuestsModal(true)}
												size="sm"
												px={6}
											>
												Invite
											</Button>
											<Button 
												bg="#E4E6EB" 
												color="#1C1E21" 
												_hover={{ bg: "#D8DADF" }}
												leftIcon={<FiSend />}
												onClick={() => setSendBlastModal(true)}
												size="sm"
											>
												Blast
											</Button>
											<Button 
												bg="#E4E6EB" 
												color="#1C1E21" 
												_hover={{ bg: "#D8DADF" }}
												leftIcon={<FiTrendingUp />}
												onClick={() => router.push(`/console/events/${eventData._id}/analytics`)}
												size="sm"
											>
												Analytics
											</Button>
											<Button 
												bg="#E4E6EB" 
												color="#1C1E21" 
												_hover={{ bg: "#D8DADF" }}
												leftIcon={<FiShare2 />}
												onClick={() => setShareModal(true)}
												size="sm"
											>
												Share
											</Button>
											<Menu>
												<MenuButton as={Button} size="sm" bg="#E4E6EB" color="#1C1E21" _hover={{ bg: "#D8DADF" }}>
													<FiMoreHorizontal />
												</MenuButton>
												<MenuList zIndex={20}>
													<MenuItem icon={<FiUserPlus />} onClick={() => router.push(`/api/events/${eventData._id}/create-users`)}>
														Create Ticket Users
													</MenuItem>
													<MenuItem icon={<FiUsers />} onClick={() => router.push(`/api/events/${eventData._id}/create-group`)}>
														Create Interest Group
													</MenuItem>
												</MenuList>
											</Menu>
										</>
									)}
								</Flex>
							</Flex>
						</Flex>
					</Box>
				</Box>

				{/* CONTENT GRID */}
				<Box maxW="1250px" mx="auto" px={{ base: 0, md: 0 }}>
					<Flex gap={4} direction={{ base: "column", lg: "row" }}>
						
						{/* LEFT COLUMN (MAIN) */}
						<Box flex="1.5" order={{ base: 2, lg: 1 }}>
							{activeTab === "about" && (
								<Box bg="white" borderRadius="lg" boxShadow="sm" p={4} mb={4}>
									<Text fontSize="xl" fontWeight="bold" mb={4} color="#1C1E21">Details</Text>
									
									<Flex gap={3} mb={4} align="center">
										<Flex align="center" justify="center" w={8}>
											<FiUsers size={20} color="#65676B" />
										</Flex>
										<Text color="#1C1E21">
											{eventData.guests?.length || 0} people responded
										</Text>
									</Flex>

									<Flex gap={3} mb={4} align="center">
										<Flex align="center" justify="center" w={8}>
											<FiGlobe size={20} color="#65676B" />
										</Flex>
										<Box>
											<Text color="#1C1E21">{eventData.privacy === 'private' ? 'Private - Only people who are invited' : 'Public - Anyone on Jetzy'}</Text>
										</Box>
									</Flex>

									<Flex gap={3} mb={6} align="start">
										<Flex align="center" justify="center" w={8} mt={1}>
											<FiClock size={20} color="#65676B" />
										</Flex>
										<Box>
											<Text color="#1C1E21" fontWeight="medium">{formattedDate}</Text>
											<Text color="#65676B" fontSize="sm">{formattedTime}</Text>
											<Text color="#65676B" fontSize="xs" mt={0.5}>{eventData.timezone}</Text>
										</Box>
									</Flex>

									{eventData.desc ? (
										<SafeHTML
											html={eventData.desc}
											style={{
												fontSize: "md",
												color: "#1C1E21",
												lineHeight: "1.6",
											}}
										/>
									) : (
										<Text fontSize="md" color="#1C1E21">
											No description provided.
										</Text>
									)}

									{/* Host Information */}
									{eventData.host && eventData.host.name && eventData.host.name.trim() !== "" && (
										<Box mt={6} pt={6} borderTop="1px" borderColor="gray.200">
											<Text fontSize="lg" fontWeight="semibold" color="#1C1E21" mb={4}>Host Information</Text>
											<Flex align="center" gap={4}>
												{eventData.host.image ? (
													<Avatar src={eventData.host.image} name={eventData.host.name} size="md" />
												) : (
													<Avatar name={eventData.host.name} size="md" bgGradient="linear(to-br, purple.400, purple.600)" color="white" />
												)}
												<Box>
													<Text fontSize="md" fontWeight="semibold" color="#1C1E21">{eventData.host.name}</Text>
													{eventData.host.email && (
														<Text fontSize="sm" color="#65676B" mt={1}>
															<a href={`mailto:${eventData.host.email}`} style={{ color: "#3182CE", textDecoration: "underline" }}>
																{eventData.host.email}
															</a>
														</Text>
													)}
													{eventData.host.phone && (
														<Text fontSize="sm" color="#65676B" mt={1}>
															<a href={`tel:${eventData.host.phone}`} style={{ color: "#3182CE", textDecoration: "underline" }}>
																{eventData.host.phone}
															</a>
														</Text>
													)}
												</Box>
											</Flex>
										</Box>
									)}
								</Box>
							)}

							{activeTab === "about" && (
								<Box bg="white" borderRadius="lg" boxShadow="sm" p={6} mb={4}>
									<Text fontSize="2xl" fontWeight="bold" mb={4} color="#1C1E21">Presented by</Text>
									<Flex align="center" gap={4}>
										<Box 
											w="64px" 
											h="64px" 
											borderRadius="lg" 
											bgGradient="linear(to-br, purple.400, purple.600)"
											display="flex"
											alignItems="center"
											justifyContent="center"
											color="white"
											fontSize="xl"
											fontWeight="bold"
											boxShadow="md"
										>
											{defaultPresenter.name.charAt(0)}
										</Box>
										<Box>
											<Text fontWeight="semibold" fontSize="lg" color="#1C1E21">
												{defaultPresenter.name}
											</Text>
										</Box>
									</Flex>
								</Box>
							)}

							{activeTab === "about" && eventData.host && eventData.host.name && eventData.host.name.trim() !== "" && (
								<Box bg="white" borderRadius="lg" boxShadow="sm" p={6} mb={4}>
									<Text fontSize="2xl" fontWeight="bold" mb={4} color="#1C1E21">Hosted by</Text>
									<Flex align="center" gap={3}>
										{eventData.host.image ? (
											<Avatar src={eventData.host.image} name={eventData.host.name} size="md" />
										) : (
											<Avatar name={eventData.host.name} size="md" bgGradient="linear(to-br, purple.400, purple.600)" color="white" />
										)}
										<Box>
											<Text fontSize="md" fontWeight="semibold" color="#1C1E21">{eventData.host.name}</Text>
											{eventData.host.email && (
												<Text fontSize="sm" color="#65676B" mt={1}>
													<a href={`mailto:${eventData.host.email}`} style={{ color: "#3182CE", textDecoration: "underline" }}>
														{eventData.host.email}
													</a>
												</Text>
											)}
											{eventData.host.phone && (
												<Text fontSize="sm" color="#65676B" mt={1}>
													<a href={`tel:${eventData.host.phone}`} style={{ color: "#3182CE", textDecoration: "underline" }}>
														{eventData.host.phone}
													</a>
												</Text>
											)}
										</Box>
									</Flex>
								</Box>
							)}

							{activeTab === "guests" && isAdmin && (
								<Box bg="white" borderRadius="lg" boxShadow="sm" p={0} mb={4} overflow="hidden">
									<Box p={4} borderBottom="1px solid #CED0D4">
										<Text fontSize="xl" fontWeight="bold" color="#1C1E21">Guest List</Text>
									</Box>
									<Box p={4}>
										<GuestsList eventId={eventData._id} />
									</Box>
								</Box>
							)}

							{activeTab === "bookings" && isAdmin && (
								<Box mb={4}>
									<Box bg="white" borderRadius="lg" boxShadow="sm" p={4} mb={4}>
										<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>Event Bookings</Text>
									</Box>
									<EventBookings eventId={eventData._id} />
								</Box>
							)}

							{activeTab === "waitingList" && isAdmin && (
								<Box bg="white" borderRadius="lg" boxShadow="sm" p={4} mb={4}>
									<Text fontSize="xl" fontWeight="bold" color="#1C1E21" mb={4}>Waiting List</Text>
									<WaitingList eventId={eventData._id} />
								</Box>
							)}

							{activeTab === "referralCodes" && isAdmin && (
								<ReferralCodesManager eventId={eventData._id} />
							)}

							{activeTab === "marketing" && (
								<MarketingTab eventId={eventData._id} eventSlug={eventData.slug} />
							)}
							
						{activeTab === "discussion" && (
							<DiscussionBoard eventId={eventData._id} />
						)}

						{activeTab === "chat" && (
							<JetzyChatIntegration 
								eventId={eventData._id} 
								eventName={eventData.name}
							/>
						)}
						</Box>

						{/* RIGHT COLUMN (SIDEBAR) */}
						<Box flex="1" order={{ base: 1, lg: 2 }}>
							{eventData.location && (
								<Box bg="white" borderRadius="lg" boxShadow="sm" p={4} mb={4} position="sticky" top="20px">
									<Text fontSize="lg" fontWeight="bold" mb={4} color="#1C1E21">Location</Text>
									
									<Flex gap={3} mb={4}>
										<FiMapPin size={20} color="#65676B" style={{ marginTop: '4px' }} />
										<Box>
											{eventData.venueName && (
												<Text fontWeight="semibold" color="#1C1E21" mb={1}>{eventData.venueName}</Text>
											)}
											<Text fontWeight="medium" color={eventData.venueName ? "#65676B" : "#1C1E21"} fontSize={eventData.venueName ? "sm" : "md"}>{eventData.location}</Text>
										</Box>
									</Flex>
									
									{/* Static Map Placeholder */}
									{eventData.location.trim() && (
										<Box 
											w="full" 
											h="200px" 
											bg="gray.100" 
											borderRadius="md" 
											mb={4} 
											position="relative"
											overflow="hidden"
										>
											{/* Use a real static map image if available or Google Maps Embed API */}
											<iframe
												width="100%"
												height="100%"
												frameBorder="0"
												style={{ border: 0 }}
												src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}&q=${encodeURIComponent(eventData.location)}`}
												allowFullScreen
											/>
										</Box>
									)}
								</Box>
							)}

							{/* Host Section - Only show if event has a host name */}
							{eventData.host && eventData.host.name && eventData.host.name.trim() !== "" && (
								<Box bg="white" borderRadius="lg" boxShadow="sm" p={4}>
									<Text fontSize="lg" fontWeight="bold" mb={4} color="#1C1E21">Host</Text>
									<Flex align="center" gap={3}>
										{eventData.host.image ? (
											<Avatar src={eventData.host.image} name={eventData.host.name} size="md" />
										) : (
											<Avatar name={eventData.host.name} size="md" bgGradient="linear(to-br, purple.400, purple.600)" color="white" />
										)}
										<Box>
											<Text fontWeight="semibold" color="#1C1E21">{eventData.host.name}</Text>
											{eventData.host.email && (
												<Text fontSize="sm" color="#65676B" mt={1}>
													<a href={`mailto:${eventData.host.email}`} style={{ color: "#3182CE", textDecoration: "underline" }}>
														{eventData.host.email}
													</a>
												</Text>
											)}
											{eventData.host.phone && (
												<Text fontSize="sm" color="#65676B" mt={1}>
													<a href={`tel:${eventData.host.phone}`} style={{ color: "#3182CE", textDecoration: "underline" }}>
														{eventData.host.phone}
													</a>
												</Text>
											)}
										</Box>
									</Flex>
								</Box>
							)}
						</Box>
					</Flex>
				</Box>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	const session = await getServerSession(context.req, context.res, authOptions)
	
	if (!session) {
		return {
			redirect: {
				destination: "/login",
				permanent: false,
			},
		}
	}

	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		await dbconn.asPromise()
	}

	// Get eventId from params (dynamic route) not query
	const eventId = (context.params?.eventId || context.query.eventId) as string
	if (!eventId) {
		return { props: {} }
	}

	const event = await Events.findOne({ _id: eventId, isDeleted: false })

	if (!event) return { props: {} }

	// Check permissions: Admin or Owner
	const user = session.user as any
	const isAdmin = user.role === "admin" || user.role === "super admin"
	const isOwner = event.ownerId?.toString() === user._id || event.host?.email === user.email

	if (!isAdmin && !isOwner) {
		return {
			redirect: {
				destination: "/console/seller",
				permanent: false,
			},
		}
	}

	return {
		props: {
			event: JSON?.stringify(event),
		},
	}
}
