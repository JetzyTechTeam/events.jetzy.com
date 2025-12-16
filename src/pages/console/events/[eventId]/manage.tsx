"use client"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { GetServerSideProps } from "next"
import React, { useState } from "react"
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
	FiMoreHorizontal
} from "react-icons/fi"
import Image from "next/image"
import { SendBlastModal } from "@/components/console/SendBlastModal"
import { InviteGuestsModal } from "@/components/console/InviteGuestsModal"
import { ShareModal } from "@/components/console/ShareModal"
import { GuestsList } from "@/components/console/GuestsList"
import { Box, Flex, Text, Button, Avatar, IconButton, Menu, MenuButton, MenuList, MenuItem, Divider, Badge } from "@chakra-ui/react"

export default function Manage({ event }: any) {
	const eventData = JSON.parse(event)
	const [shareModal, setShareModal] = useState(false)
	const [inviteGuestsModal, setInviteGuestsModal] = useState(false)
	const [sendBlastModal, setSendBlastModal] = useState(false)
	const [activeTab, setActiveTab] = useState<"about" | "guests" | "discussion">("about")
	const router = useRouter()
	const { data: session } = useSession()

	// @ts-ignore
	if (session?.user?.role === Roles.USER) router.push("/console")

	const eventDate = DateTime.fromISO(eventData.startsOn).toLocal()
	const endDate = DateTime.fromISO(eventData.endsOn).toLocal()
	const formattedDate = eventDate.toFormat("EEEE, MMMM d, yyyy")
	const formattedTime = `${eventDate.toFormat("t")} - ${endDate.toFormat("t")}`
	const month = eventDate.toFormat("MMM").toUpperCase()
	const day = eventDate.toFormat("d")

	return (
		<>
			<Head>
				<title>{eventData.name} - Jetzy Events</title>
				<meta name="description" content={`Manage ${eventData.name}`} />
				<meta name="robots" content="noindex, nofollow" />
			</Head>
			
			<ConsoleLayout page="Event Details" backBtn="/console/events" maxW="100%" bg="#F0F2F5">
				{/* MODALS */}
				<InviteGuestsModal inviteGuestsModal={inviteGuestsModal} setInviteGuestsModal={setInviteGuestsModal} event={eventData} />
				<SendBlastModal sendBlastModal={sendBlastModal} setSendBlastModal={setSendBlastModal} event={eventData} />
				<ShareModal shareModal={shareModal} setShareModal={setShareModal} eventSlug={eventData.slug} />

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
									<Text 
										fontSize={{ base: "2xl", md: "4xl" }} 
										fontWeight="800" 
										color="#1C1E21" 
										lineHeight="1.2"
										mb={1}
									>
										{eventData.name}
									</Text>
									<Text color="#65676B" fontSize="md">
										{eventData.location}
									</Text>
								</Box>
								
								{/* Check-in / Ticket Actions */}
								<Flex gap={2}>
									<Button 
										bg="#E4E6EB" 
										color="#1C1E21" 
										_hover={{ bg: "#D8DADF" }}
										leftIcon={<FiCheckCircle />}
										onClick={() => router.push(`/console/events/${eventData._id}/check-in`)}
									>
										Check-In
									</Button>
									<Menu>
										<MenuButton as={Button} bg="#E4E6EB" px={3} _hover={{ bg: "#D8DADF" }}>
											<FiMoreHorizontal />
										</MenuButton>
										<MenuList zIndex={20}>
											<MenuItem icon={<FiEdit />} onClick={() => router.push(`/console/events/${eventData._id}/update`)}>Edit Event</MenuItem>
											<MenuItem icon={<FiShare2 />} onClick={() => setShareModal(true)}>Share</MenuItem>
										</MenuList>
									</Menu>
								</Flex>
							</Flex>

							<Divider borderColor="#CED0D4" my={2} />

							{/* Action Bar */}
							<Flex justify="space-between" align="center" wrap="wrap" gap={4}>
								<Flex gap={1} overflowX="auto" pb={1} sx={{ '::-webkit-scrollbar': { display: 'none' } }}>
									{["About", "Guests", "Discussion"].map((tab) => (
										<Button
											key={tab}
											variant="ghost"
											color={activeTab === tab.toLowerCase() ? "#1877F2" : "#65676B"}
											borderBottom={activeTab === tab.toLowerCase() ? "3px solid #1877F2" : "3px solid transparent"}
											borderRadius="0"
											px={4}
											h="50px"
											_hover={{ bg: "#F0F2F5", borderRadius: "md", borderBottom: "3px solid transparent" }}
											onClick={() => setActiveTab(tab.toLowerCase() as any)}
											fontSize="md"
											fontWeight="600"
										>
											{tab}
										</Button>
									))}
								</Flex>
								
								<Flex gap={2}>
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
										leftIcon={<FiShare2 />}
										onClick={() => setShareModal(true)}
										size="sm"
									>
										Share
									</Button>
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
											<Text color="#1C1E21">{eventData.privacy === 'private' ? 'Private' : 'Public'} · Anyone on or off Jetzy</Text>
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

									<Text fontSize="md" color="#1C1E21" whiteSpace="pre-wrap" lineHeight="1.6">
										{eventData.desc || "No description provided."}
									</Text>
								</Box>
							)}

							{activeTab === "guests" && (
								<Box bg="white" borderRadius="lg" boxShadow="sm" p={0} mb={4} overflow="hidden">
									<Box p={4} borderBottom="1px solid #CED0D4">
										<Text fontSize="xl" fontWeight="bold" color="#1C1E21">Guest List</Text>
									</Box>
									<GuestsList eventId={eventData._id} />
								</Box>
							)}
							
							{activeTab === "discussion" && (
								<Box bg="white" borderRadius="lg" boxShadow="sm" p={8} mb={4} textAlign="center">
									<Text color="#65676B">Discussion board coming soon...</Text>
								</Box>
							)}
						</Box>

						{/* RIGHT COLUMN (SIDEBAR) */}
						<Box flex="1" order={{ base: 1, lg: 2 }}>
							<Box bg="white" borderRadius="lg" boxShadow="sm" p={4} mb={4} position="sticky" top="20px">
								<Text fontSize="lg" fontWeight="bold" mb={4} color="#1C1E21">Location</Text>
								
								<Flex gap={3} mb={4}>
									<FiMapPin size={20} color="#65676B" style={{ marginTop: '4px' }} />
									<Box>
										<Text fontWeight="medium" color="#1C1E21">{eventData.location}</Text>
										<Text fontSize="sm" color="#65676B">{eventData.location}</Text>
									</Box>
								</Flex>
								
								{/* Static Map Placeholder */}
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
							</Box>

							<Box bg="white" borderRadius="lg" boxShadow="sm" p={4}>
								<Text fontSize="lg" fontWeight="bold" mb={4} color="#1C1E21">Host</Text>
								<Flex align="center" gap={3}>
									<Avatar name={session?.user?.name || "Host"} src={session?.user?.image || ""} size="md" />
									<Box>
										<Text fontWeight="semibold" color="#1C1E21">{session?.user?.name || "Event Host"}</Text>
										<Text fontSize="sm" color="#65676B">Host</Text>
									</Box>
								</Flex>
							</Box>
						</Box>
					</Flex>
				</Box>
			</ConsoleLayout>
		</>
	)
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	const session = await authorizedOnly(context)
	if (!session) return session

	// Ensure database connection is ready
	const { dbconn } = await import("@/configs/database")
	if (dbconn.readyState !== 1) {
		console.log("[console/events/manage] Database not connected, attempting to connect...")
		await dbconn.asPromise()
	}

	const eventId = context.query.eventId as string
	if (!eventId) return { props: {} }

	const event = await Events.findOne({ _id: eventId, isDeleted: false })

	if (!event) return { props: {} }

	return {
		props: {
			event: JSON?.stringify(event),
		},
	}
}
