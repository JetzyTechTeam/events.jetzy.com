"use client"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { authorizedOnly } from "@/lib/authSession"
import { Events } from "@/models/events"
import { GetServerSideProps } from "next"
import React, { useEffect, useState } from "react"
import {
	Button,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalCloseButton,
	Input,
	Text,
	Textarea,
	useToast,
	Box,
	UnorderedList,
	ListItem,
	Flex,
	Heading,
	Tabs,
	TabList,
	Tab,
	TabPanels,
	TabPanel,
	Select,
	Badge,
	Avatar,
	Card,
	CardBody,
	HStack,
	VStack,
	Spinner,
	Divider,
	Grid,
	GridItem,
} from "@chakra-ui/react"
import { DateTime } from "luxon"
import axios from "axios"
import { useQuery } from "@tanstack/react-query"
import { DateTimeSVG, LocationSVG, MessageSVG, UserPlusSVG } from "@/assets/icons"
import { ShareIcon, CheckCircleIcon } from "@heroicons/react/20/solid"
import { useRouter } from "next/router"
import { Roles } from "@/types"
import { redirect } from "next/navigation"
import { useSession } from "next-auth/react"

export default function Manage({ event }: any) {
	event = JSON.parse(event)

	const [shareModal, setShareModal] = useState(false)
	const [inviteGuestsModal, setInviteGuestsModal] = useState(false)
	const [sendBlastModal, setSendBlastModal] = useState(false)
	const router = useRouter()
	const { data: session } = useSession()

	// @ts-ignore
	if (session?.user?.role === Roles.USER) router.push("/console")

	return (
		<>
			<ConsoleLayout
				page={event.name}
				backBtn="/console/events"
				component={
					<div className="flex flex-col sm:flex-row gap-2">
						<Button
							bg="#F79432"
							color="black"
							_hover={{ bg: "#E68422" }}
							_active={{ bg: "#E68422" }}
							onClick={() => router.push(`/console/events/${event._id}/check-in`)}
							fontWeight="bold"
							size={{ base: "sm", md: "md" }}
							w={{ base: "full", sm: "auto" }}
						>
							Check-In Portal
						</Button>
						<Button
							bg="#3E3E3E"
							color="white"
							_hover={{ bg: "#323232" }}
							_active={{ bg: "#323232" }}
							onClick={() => router.push(`/console/events/${event._id}/update`)}
							size={{ base: "sm", md: "md" }}
							w={{ base: "full", sm: "auto" }}
						>
							Edit Event
						</Button>
					</div>
				}
			>
				{/* INVITE GUESTS MODAL  */}
				<InviteGuestsModal inviteGuestsModal={inviteGuestsModal} setInviteGuestsModal={setInviteGuestsModal} event={event} />

				{/* SEND BLAST MODAL  */}
				<SendBlastModal sendBlastModal={sendBlastModal} setSendBlastModal={setSendBlastModal} event={event} />

				{/* SHARE MODAL  */}
				<ShareModal shareModal={shareModal} setShareModal={setShareModal} eventSlug={event.slug} />
				<Tabs variant="line">
					<TabList borderBottom="2px solid #9C9C9C" overflowX="auto" overflowY="hidden">
						<Tab
							fontWeight="bold"
							color="#9C9C9C"
							fontSize={{ base: "sm", md: "md" }}
							_selected={{
								color: "#F79432",
								borderBottom: "2px solid #F79432",
							}}
						>
							Overview
						</Tab>
						<Tab
							fontWeight="bold"
							color="#9C9C9C"
							fontSize={{ base: "sm", md: "md" }}
							_selected={{
								color: "#F79432",
								borderBottom: "2px solid #F79432",
							}}
						>
							Guests
						</Tab>
					</TabList>
					<TabPanels>
						<TabPanel px={{ base: 2, md: 4 }}>
							<div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-5 mb-6 sm:mb-10">
								<div
									className="bg-[#1E1E1E] border border-[#434343] rounded-xl sm:rounded-2xl p-3 sm:p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
									onClick={() => setInviteGuestsModal(true)}
								>
									<div className="flex-shrink-0">
										<UserPlusSVG />
									</div>
									<div
										className="bg-[#1E1E1E] border border-[#434343] rounded-xl sm:rounded-2xl p-3 sm:p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
										onClick={() => setSendBlastModal(true)}
									>
										<div className="flex-shrink-0">
											<MessageSVG />
										</div>
										<p className="font-bold text-[#9C9C9C] text-sm sm:text-base">Send a Blast</p>
									</div>
									<p className="font-bold text-[#9C9C9C] text-sm sm:text-base">Send a Blast</p>
								</div>
								<div
									className="bg-[#1E1E1E] border border-[#434343] rounded-xl sm:rounded-2xl p-3 sm:p-4 w-full cursor-pointer hover:shadow-xl transition-all duration-300 flex items-center gap-x-2"
									onClick={() => setShareModal(true)}
								>
									<ShareIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#949494] flex-shrink-0" />
									<p className="font-bold text-[#9C9C9C] text-sm sm:text-base">Share Event</p>
								</div>
							</div>
							<div className="flex flex-col lg:flex-row h-full gap-4 sm:gap-5">
								<div className="w-full lg:w-[250px] h-[200px] sm:h-[250px] lg:h-[200px] object-cover object-top rounded-xl sm:rounded-2xl flex-shrink-0">
									<img src={event.images[0]} alt={event.name} className="w-full h-full object-cover object-top rounded-xl sm:rounded-2xl" />
									<p className="font-semibold flex gap-x-2 items-start sm:items-center text-sm sm:text-base">
										<span className="flex-shrink-0 mt-1 sm:mt-0">
											<DateTimeSVG stroke="#fff" />
										</span>
										<span className="break-words">
											{DateTime.fromISO(event.startsOn).toLocal().toFormat("EEE LLL dd yyyy hh:mm:ss a")} {event.timezone}
										</span>
									</p>
									<div className="py-6 sm:py-10 px-2 sm:px-3 flex flex-col gap-y-2 sm:gap-y-3 border-b border-[#585858]">
										<h4 className="font-bold text-base sm:text-lg">Where</h4>
										<p className="font-semibold flex gap-x-2 items-start sm:items-center text-sm sm:text-base">
											<span className="flex-shrink-0 mt-1 sm:mt-0">
												<LocationSVG stroke="#fff" />
											</span>
											<span className="break-words">{event.location}</span>
										</p>
									</div>
									<div className="p-2 sm:p-3 flex flex-col gap-y-2 sm:gap-y-3">
										<h4 className="font-bold text-base sm:text-lg">Description</h4>
										<p className="font-semibold text-[#B5B6B7] text-sm sm:text-base break-words">{event.desc}</p>
									</div>
								</div>
							</div>
						</TabPanel>
						<TabPanel px={{ base: 2, md: 4 }}>
							<GuestsList eventId={event._id} />
						</TabPanel>
					</TabPanels>
				</Tabs>
			</ConsoleLayout>
		</>
	)
}

function SendBlastModal({ sendBlastModal, setSendBlastModal, event }: { sendBlastModal: boolean; setSendBlastModal: (sendBlastModal: boolean) => void; event: any }) {
	const [subject, setSubject] = useState("")
	const [message, setMessage] = useState("")
	const [status, setStatus] = useState("")
	const [targetType, setTargetType] = useState("invitations")
	const [emailType, setEmailType] = useState("custom")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")

	const toast = useToast()

	const onSendBlast = async () => {
		if (!status || !subject.trim() || !message.trim()) {
			setError("All fields are required.")
			return
		}
		setError("")
		setLoading(true)
		try {
			await axios.post("/api/send-blast", {
				event,
				message,
				subject,
				status,
				targetType,
				emailType,
				eventLink: `${process.env.NEXT_PUBLIC_URL}/${event.slug}`,
			})

			toast({
				title: "Blast sent!",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		} catch (error) {
			toast({
				title: "Failed to send blast.",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		}
		setLoading(false)
		setSendBlastModal(false)
	}

	return (
		<Modal isOpen={sendBlastModal} onClose={() => setSendBlastModal(false)} isCentered size="xl">
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white" mx={{ base: 4, md: 0 }} maxH={{ base: "90vh", md: "auto" }} overflowY={{ base: "auto", md: "visible" }}>
				<ModalHeader fontSize={{ base: "lg", md: "xl" }}>Send a Blast</ModalHeader>
				<ModalCloseButton />
				<ModalBody pb={6}>
					<Box display="flex" flexDirection="column" gap={4}>
						<Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }}>
							Target Audience
						</Text>
						<Select
							mb={4}
							placeholder="Select target audience"
							value={targetType}
							onChange={(e) => setTargetType(e.target.value)}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							size={{ base: "sm", md: "md" }}
							_placeholder={{ color: "gray.400" }}
							_focus={{
								bg: "#090C10",
								borderColor: "#888",
								color: "white",
							}}
							_hover={{
								bg: "#090C10",
								borderColor: "#666",
							}}
						>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="invitations">
								Event Invitations
							</option>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="bookings">
								Event Bookings
							</option>
						</Select>

						<Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }}>
							Email Type
						</Text>
						<Select
							mb={4}
							placeholder="Select email type"
							value={emailType}
							onChange={(e) => setEmailType(e.target.value)}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							size={{ base: "sm", md: "md" }}
							_placeholder={{ color: "gray.400" }}
							_focus={{
								bg: "#090C10",
								borderColor: "#888",
								color: "white",
							}}
							_hover={{
								bg: "#090C10",
								borderColor: "#666",
							}}
						>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="custom">
								Custom Message
							</option>
							<option style={{ backgroundColor: "#090C10", color: "white" }} value="availability">
								Event Availability
							</option>
						</Select>
						<Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }}>
							Status
						</Text>
						<Select
							mb={4}
							placeholder="Select a Status"
							value={status}
							onChange={(e) => setStatus(e.target.value)}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							size={{ base: "sm", md: "md" }}
							_placeholder={{ color: "gray.400" }}
							_focus={{
								bg: "#090C10",
								borderColor: "#888",
								color: "white",
							}}
							_hover={{
								bg: "#090C10",
								borderColor: "#666",
							}}
						>
							{targetType === "bookings" ? (
								<>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="all">
										All Bookings
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="pending">
										Pending
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="approved">
										Approved
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="confirmed">
										Confirmed
									</option>
								</>
							) : (
								<>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="pending">
										Pending
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="accepted">
										Accepted
									</option>
									<option style={{ backgroundColor: "#090C10", color: "white" }} value="rejected">
										Rejected
									</option>
								</>
							)}
						</Select>
						<h3 className="font-bold text-sm sm:text-base">Subject</h3>
						<Input
							type="text"
							placeholder="Enter a Subject here..."
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							mb={2}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							size={{ base: "sm", md: "md" }}
							_placeholder={{ color: "gray.400" }}
						/>

						<h3 className="font-bold text-sm sm:text-base">Body</h3>
						<Textarea
							rows={5}
							placeholder="Enter your blast message here..."
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							mb={2}
							isRequired
							bg="#090C10"
							borderColor="#444444"
							color="white"
							fontSize={{ base: "sm", md: "md" }}
							_placeholder={{ color: "gray.400" }}
						/>
						{error && (
							<Text color="red.500" fontSize={{ base: "sm", md: "md" }}>
								{error}
							</Text>
						)}

						<Button size={{ base: "md", md: "lg" }} bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} isLoading={loading} onClick={onSendBlast} w="full">
							Send Blast
						</Button>
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

function GuestsList({ eventId }: { eventId: string }) {
	const [activeTab, setActiveTab] = React.useState<"invited" | "checkedIn">("invited")

	// Fetch invited guests from the event guests list
	const fetchInvitedGuests = async () => {
		const res = await axios.get("/api/guests-list", { params: { eventId } })
		return res.data || []
	}

	// Fetch checked-in guests from the database (EventGuest model)
	// This displays all guests who have been checked in via the check-in portal
	const fetchCheckedInGuests = async () => {
		try {
			const res = await axios.get(`/api/check-in/guests?eventId=${eventId}`)
			console.log("Checked-in guests response:", res.data)

			if (res.data?.status && res.data?.data?.guests) {
				return res.data.data.guests
			}
			return []
		} catch (error) {
			console.error("Error fetching checked-in guests:", error)
			return []
		}
	}

	// Fetch check-in stats to get total count including anonymous check-ins
	const fetchCheckInStats = async () => {
		try {
			const res = await axios.get(`/api/check-in/stats?eventId=${eventId}`)
			if (res.data?.status && res.data?.data) {
				return res.data.data
			}
			return { totalGuestsCheckedIn: 0 }
		} catch (error) {
			console.error("Error fetching check-in stats:", error)
			// Return default stats object if API fails
			return { totalGuestsCheckedIn: 0 }
		}
	}

	const {
		data: invitedGuests = [],
		isLoading: isLoadingInvited,
		isError: isErrorInvited,
	} = useQuery({
		queryKey: ["guests-list", eventId],
		queryFn: fetchInvitedGuests,
	})

	const {
		data: checkedInGuests = [],
		isLoading: isLoadingCheckedIn,
		isError: isErrorCheckedIn,
		refetch: refetchCheckedIn,
	} = useQuery({
		queryKey: ["checked-in-guests", eventId],
		queryFn: fetchCheckedInGuests,
		refetchInterval: 5000, // Auto-refresh every 5 seconds
	})

	const {
		data: checkInStats,
		isLoading: isLoadingStats,
		isError: isStatsError,
	} = useQuery({
		queryKey: ["check-in-stats", eventId],
		queryFn: fetchCheckInStats,
		refetchInterval: 5000,
		retry: 1, // Only retry once
		enabled: !!eventId, // Only run if eventId exists
	})

	// Calculate anonymous check-ins (total checked in - guests with details)
	// If stats API fails, just use the guests we have
	const totalCheckedIn = isStatsError ? checkedInGuests.length : checkInStats?.totalGuestsCheckedIn || checkedInGuests.length
	const guestsWithDetails = checkedInGuests.length
	const anonymousCheckIns = Math.max(0, totalCheckedIn - guestsWithDetails)

	// Debug logging
	React.useEffect(() => {
		console.log("Checked-in guests data:", checkedInGuests)
		console.log("Check-in stats:", checkInStats)
		console.log("Stats error:", isStatsError)
		console.log("Total checked in:", totalCheckedIn)
		console.log("Guests with details:", guestsWithDetails)
		console.log("Anonymous check-ins:", anonymousCheckIns)
	}, [checkedInGuests, checkInStats, isStatsError, totalCheckedIn, guestsWithDetails, anonymousCheckIns])

	return (
		<Box>
			{/* Tab Selector */}
			<Flex gap={2} mb={6}>
				<Button
					flex="1"
					bg={activeTab === "invited" ? "#F79432" : "#2A2A2A"}
					color={activeTab === "invited" ? "black" : "white"}
					_hover={{ bg: activeTab === "invited" ? "#E68422" : "#3A3A3A" }}
					onClick={() => setActiveTab("invited")}
					borderRadius="lg"
					fontWeight="bold"
					size={{ base: "sm", md: "md" }}
				>
					Invited Guests ({invitedGuests.length})
				</Button>
				<Button
					flex="1"
					bg={activeTab === "checkedIn" ? "#F79432" : "#2A2A2A"}
					color={activeTab === "checkedIn" ? "black" : "white"}
					_hover={{ bg: activeTab === "checkedIn" ? "#E68422" : "#3A3A3A" }}
					onClick={() => setActiveTab("checkedIn")}
					borderRadius="lg"
					fontWeight="bold"
					size={{ base: "sm", md: "md" }}
				>
					Checked-In ({totalCheckedIn})
				</Button>
			</Flex>

			{/* Invited Guests Tab */}
			{activeTab === "invited" && (
				<Box>
					{isLoadingInvited ? (
						<Flex justify="center" align="center" py={8}>
							<Spinner size="lg" color="#F79432" />
						</Flex>
					) : isErrorInvited ? (
						<Text color="red.500" fontSize={{ base: "sm", md: "md" }}>
							Failed to load invited guests.
						</Text>
					) : invitedGuests.length === 0 ? (
						<Text fontSize={{ base: "sm", md: "md" }} color="gray.400" textAlign="center" py={8}>
							No invited guests yet.
						</Text>
					) : (
						<Box className="bg-[#181818] rounded-xl p-2 sm:p-3 flex flex-col gap-y-3">
							<Flex fontWeight="bold" mb={2} display={{ base: "none", md: "flex" }} fontSize="sm">
								<Box flex="1">Email</Box>
								<Box flex="1">Status</Box>
								<Box flex="1">Invited At</Box>
							</Flex>
							{invitedGuests.map((guest: { email: string; status: string; invitedAt: string }) => (
								<Flex key={guest.email} borderBottom="1px solid #4B4B4B" py={2} direction={{ base: "column", md: "row" }} gap={{ base: 2, md: 0 }} fontSize={{ base: "sm", md: "md" }}>
									<Box flex="1" wordBreak="break-word">
										<Text display={{ base: "inline", md: "none" }} fontWeight="bold" mr={2}>
											Email:
										</Text>
										{guest.email}
									</Box>
									<Box flex="1">
										<Text display={{ base: "inline", md: "none" }} fontWeight="bold" mr={2}>
											Status:
										</Text>
										<Badge colorScheme={guest.status === "accepted" ? "green" : guest.status === "rejected" ? "red" : "yellow"} fontSize="xs">
											{guest.status}
										</Badge>
									</Box>
									<Box flex="1">
										<Text display={{ base: "inline", md: "none" }} fontWeight="bold" mr={2}>
											Invited At:
										</Text>
										{guest.invitedAt ? DateTime.fromISO(guest.invitedAt).toLocaleString(DateTime.DATETIME_MED) : "-"}
									</Box>
								</Flex>
							))}
						</Box>
					)}
				</Box>
			)}

			{/* Checked-In Guests Tab */}
			{activeTab === "checkedIn" && (
				<Box>
					{isLoadingCheckedIn && !isStatsError ? (
						<Flex justify="center" align="center" py={8}>
							<Spinner size="lg" color="#F79432" />
						</Flex>
					) : isErrorCheckedIn ? (
						<Text color="red.500" fontSize={{ base: "sm", md: "md" }}>
							Failed to load checked-in guests.
						</Text>
					) : totalCheckedIn === 0 ? (
						<Box textAlign="center" py={12}>
							<Text fontSize="4xl" mb={4}>
								🎟️
							</Text>
							<Text fontSize="lg" fontWeight="bold" mb={2}>
								No Check-Ins Yet
							</Text>
							<Text color="gray.400" fontSize="sm">
								Guests will appear here once they check in to the event
							</Text>
						</Box>
					) : (
						<VStack align="stretch" spacing={6}>
							{/* Summary Banner */}
							{anonymousCheckIns > 0 && (
								<Box bg="#2A2A2A" border="1px solid #F79432" borderRadius="xl" p={4}>
									<HStack justify="space-between" flexWrap="wrap" gap={4}>
										<VStack align="start" spacing={1}>
											<Text fontSize="sm" color="gray.400">
												Total Check-Ins
											</Text>
											<Text fontSize="2xl" fontWeight="bold" color="white">
												{totalCheckedIn}
											</Text>
										</VStack>
										<VStack align="start" spacing={1}>
											<Text fontSize="sm" color="gray.400">
												With Details
											</Text>
											<Text fontSize="2xl" fontWeight="bold" color="#F79432">
												{guestsWithDetails}
											</Text>
										</VStack>
										<VStack align="start" spacing={1}>
											<Text fontSize="sm" color="gray.400">
												Without Details
											</Text>
											<Text fontSize="2xl" fontWeight="bold" color="orange.300">
												{anonymousCheckIns}
											</Text>
										</VStack>
									</HStack>
								</Box>
							)}

							<Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }} gap={4}>
								{/* Render guests with details */}
								{checkedInGuests.map((guest: any) => (
									<Card
										key={guest.id}
										bg="linear-gradient(135deg, #1E1E1E 0%, #2A2A2A 100%)"
										border="1px solid #434343"
										borderRadius="xl"
										overflow="hidden"
										transition="all 0.3s"
										_hover={{ transform: "translateY(-4px)", boxShadow: "0 8px 24px rgba(247, 148, 50, 0.2)" }}
									>
										<CardBody p={4}>
											<VStack align="stretch" spacing={3}>
												{/* Header with Avatar and Check Icon */}
												<Flex justify="space-between" align="start">
													<HStack spacing={3}>
														<Avatar name={guest.guestName} bg="#F79432" color="black" size={{ base: "md", md: "lg" }} fontWeight="bold" />
														<Box flex="1">
															<Text fontWeight="bold" fontSize={{ base: "md", md: "lg" }} color="white" noOfLines={1}>
																{guest.guestName}
															</Text>
															<HStack spacing={1} mt={1}>
																<CheckCircleIcon className="w-4 h-4 text-green-400" />
																<Text fontSize="xs" color="green.400" fontWeight="semibold">
																	Checked In
																</Text>
															</HStack>
														</Box>
													</HStack>
												</Flex>

												<Divider borderColor="#434343" />

												{/* Contact Information */}
												<VStack align="stretch" spacing={2} fontSize="sm">
													<HStack>
														<Text color="gray.400" minW="60px">
															📧
														</Text>
														<Text color="white" noOfLines={1} wordBreak="break-all" fontSize={{ base: "xs", md: "sm" }}>
															{guest.guestEmail}
														</Text>
													</HStack>
													<HStack>
														<Text color="gray.400" minW="60px">
															📱
														</Text>
														<Text color="white" fontSize={{ base: "xs", md: "sm" }}>
															{guest.guestPhone}
														</Text>
													</HStack>
												</VStack>

												<Divider borderColor="#434343" />

												{/* Check-in Details */}
												<VStack align="stretch" spacing={1} fontSize="xs" color="gray.400">
													<HStack justify="space-between">
														<Text>Check-In Time:</Text>
														<Text color="white" fontWeight="semibold">
															{DateTime.fromISO(guest.checkedInAt).toLocaleString(DateTime.DATETIME_SHORT)}
														</Text>
													</HStack>
													<HStack justify="space-between">
														<Text>Booking Email:</Text>
														<Text color="white" noOfLines={1} maxW="60%">
															{guest.bookingEmail}
														</Text>
													</HStack>
													<HStack justify="space-between">
														<Text>Checked In By:</Text>
														<Badge colorScheme="purple" fontSize="2xs">
															{guest.checkedInBy}
														</Badge>
													</HStack>
												</VStack>
											</VStack>
										</CardBody>
									</Card>
								))}

								{/* Render anonymous check-ins */}
								{Array.from({ length: anonymousCheckIns }).map((_, index) => (
									<Card key={`anonymous-${index}`} bg="linear-gradient(135deg, #2A2A2A 0%, #1E1E1E 100%)" border="1px solid #666" borderRadius="xl" overflow="hidden" opacity="0.8">
										<CardBody p={4}>
											<VStack align="stretch" spacing={3}>
												{/* Header with Avatar */}
												<Flex justify="space-between" align="start">
													<HStack spacing={3}>
														<Avatar name="?" bg="gray.600" color="white" size={{ base: "md", md: "lg" }} fontWeight="bold" />
														<Box flex="1">
															<Text fontWeight="bold" fontSize={{ base: "md", md: "lg" }} color="gray.300">
																Guest #{guestsWithDetails + index + 1}
															</Text>
															<HStack spacing={1} mt={1}>
																<CheckCircleIcon className="w-4 h-4 text-green-400" />
																<Text fontSize="xs" color="green.400" fontWeight="semibold">
																	Checked In
																</Text>
															</HStack>
														</Box>
													</HStack>
												</Flex>

												<Divider borderColor="#434343" />

												{/* Anonymous Notice */}
												<Box bg="#1A1A1A" p={3} borderRadius="md" border="1px dashed #666">
													<VStack align="center" spacing={2}>
														<Text fontSize="3xl">👤</Text>
														<Text fontSize="sm" color="gray.400" textAlign="center">
															Details not captured
														</Text>
														<Text fontSize="xs" color="gray.500" textAlign="center">
															This guest was checked in without providing their contact information
														</Text>
													</VStack>
												</Box>
											</VStack>
										</CardBody>
									</Card>
								))}
							</Grid>
						</VStack>
					)}
				</Box>
			)}
		</Box>
	)
}

function InviteGuestsModal({ inviteGuestsModal, setInviteGuestsModal, event }: { inviteGuestsModal: boolean; setInviteGuestsModal: (inviteGuestsModal: boolean) => void; event: any }) {
	const [emails, setEmails] = useState<string[]>([])
	const [step, setStep] = useState(1)
	const [loading, setLoading] = useState(false)
	const [message, setMessage] = useState("")
	const [emailInput, setEmailInput] = useState("")
	const [emailError, setEmailError] = useState("")
	const toast = useToast()

	const handleAddEmail = () => {
		const email = emailInput.trim()
		if (!email) {
			setEmailError("Please enter an email")
			return
		}
		// Simple email validation
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			setEmailError("Please enter a valid email")
			return
		}
		if (emails.includes(email)) {
			setEmailError("Email already added")
			return
		}
		setEmails([...emails, email])
		setEmailInput("")
		setEmailError("")
	}

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault()
			handleAddEmail()
		}
	}

	const handleNext = () => setStep(2)
	const handleBack = () => setStep(1)

	const onSendInvitation = async () => {
		setLoading(true)
		try {
			await axios.post("/api/send-invites", {
				emails,
				message,
				subject: `Hi, Jetzy Events invite you to join ${event.name}!`,
				eventLink: `${process.env.NEXT_PUBLIC_URL}/events/${event._id}/guests/invite`,
				eventId: event._id,
			})
			setLoading(false)
			setStep(1)
			setEmails([])
			setMessage("")
			setInviteGuestsModal(false)
			toast({
				title: "Invitations sent!",
				status: "success",
				duration: 3000,
				isClosable: true,
			})
		} catch (error) {
			setLoading(false)
			toast({
				title: "Failed to send invitations.",
				status: "error",
				duration: 3000,
				isClosable: true,
			})
		}
	}

	useEffect(() => {
		if (!inviteGuestsModal) {
			setStep(1)
			setEmails([])
			setMessage("")
			setEmailInput("")
			setEmailError("")
		}
	}, [inviteGuestsModal])

	return (
		<Modal isOpen={inviteGuestsModal} onClose={() => setInviteGuestsModal(false)} isCentered size={step === 2 ? "4xl" : "2xl"}>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white" mx={{ base: 4, md: 0 }} maxH={{ base: "90vh", md: "auto" }} overflowY={{ base: "auto", md: "visible" }}>
				<ModalHeader fontSize={{ base: "lg", md: "xl" }}>{step === 1 ? "Invite Guests" : "Review Invited Emails"}</ModalHeader>
				<ModalCloseButton />
				<ModalBody pb={6}>
					<Box display="flex" flexDirection="column" gap={4}>
						{step === 1 && (
							<>
								<Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }}>
									Invite your guests by email:
								</Text>
								<Flex gap={2} direction={{ base: "column", sm: "row" }}>
									<Input
										type="email"
										placeholder="Enter your guest's email"
										value={emailInput}
										onChange={(e) => setEmailInput(e.target.value)}
										onKeyDown={handleInputKeyDown}
										isInvalid={!!emailError}
										size={{ base: "sm", md: "md" }}
										flex="1"
									/>
									<Button bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} onClick={handleAddEmail} size={{ base: "sm", md: "md" }} w={{ base: "full", sm: "auto" }}>
										Add
									</Button>
								</Flex>
								{emailError && (
									<Text color="red.500" fontSize="sm">
										{emailError}
									</Text>
								)}
								{emails.length > 0 && (
									<Box mt={2}>
										<Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }}>
											Inviting {emails.length} Emails:
										</Text>
										<UnorderedList listStyleType="none" m="0" pt="2">
											{emails.map((email) => (
												<ListItem key={email} className="bg-[#383838] p-2 rounded-lg" my="2">
													<Flex align="center" justify="space-between" gap={2}>
														<span className="break-words text-sm sm:text-base">{email}</span>
														<Button size="xs" colorScheme="red" variant="ghost" ml={2} onClick={() => setEmails(emails.filter((e) => e !== email))}>
															x
														</Button>
													</Flex>
												</ListItem>
											))}
										</UnorderedList>
									</Box>
								)}
								<Button
									size={{ base: "md", md: "lg" }}
									bg="#F79432"
									color="black"
									_hover={{ bg: "#f78c22" }}
									_active={{ bg: "#e67a10" }}
									mt={4}
									isDisabled={emails.length === 0}
									onClick={handleNext}
									width="full"
								>
									Next
								</Button>
							</>
						)}
						{step === 2 && (
							<>
								<Flex align="flex-start" justify="space-between" gap={6} flexWrap="wrap" direction={{ base: "column", lg: "row" }}>
									<Box flex="1" minW={{ base: "full", lg: "200px" }}>
										<Text mb={2} fontSize={{ base: "sm", md: "md" }}>
											Here are the emails you have entered:
										</Text>
										<UnorderedList pl={5} fontSize={{ base: "sm", md: "md" }}>
											{emails.map((email) => (
												<ListItem key={email} className="break-words">
													{email}
												</ListItem>
											))}
										</UnorderedList>
									</Box>
									<Box borderWidth="1px" borderRadius="xl" p={4} flex="1" minW={{ base: "full", lg: "300px" }}>
										<Text fontWeight="bold" mb={2} fontSize={{ base: "sm", md: "md" }}>
											Hi, Jetzy Events invites you to join {event.name}.
										</Text>
										<Textarea rows={3} placeholder="Enter a custom message here..." value={message} onChange={(e) => setMessage(e.target.value)} mb={2} fontSize={{ base: "sm", md: "md" }} />
										<Text fontWeight="bold" mb={1} fontSize={{ base: "xs", md: "sm" }} className="break-words">
											RSVP: {process.env.NEXT_PUBLIC_URL}/{event.slug}
										</Text>
										<Text fontSize={{ base: "xs", md: "sm" }}>We will send guests an invitation link to register for the event.</Text>
									</Box>
								</Flex>
								<Flex mt={4} mb={4} justify="space-between" gap={2} direction={{ base: "column", sm: "row" }}>
									<Button onClick={handleBack} size={{ base: "sm", md: "md" }} w={{ base: "full", sm: "auto" }}>
										Back
									</Button>
									<Button
										bg="#F79432"
										color="black"
										_hover={{ bg: "#f78c22" }}
										_active={{ bg: "#e67a10" }}
										isLoading={loading}
										onClick={onSendInvitation}
										size={{ base: "sm", md: "md" }}
										w={{ base: "full", sm: "auto" }}
									>
										Send Invitations
									</Button>
								</Flex>
							</>
						)}
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

function ShareModal({ shareModal, setShareModal, eventSlug }: { shareModal: boolean; setShareModal: (shareModal: boolean) => void; eventSlug: string }) {
	const [copied, setCopied] = useState(false)

	const sharelink = `${process.env.NEXT_PUBLIC_URL}/${eventSlug}`

	const onCopy = () => {
		navigator.clipboard.writeText(sharelink).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		})
	}

	return (
		<Modal isOpen={shareModal} onClose={() => setShareModal(false)} isCentered>
			<ModalOverlay />
			<ModalContent bg="#1E1E1E" color="white" mx={{ base: 4, md: 0 }}>
				<ModalHeader fontSize={{ base: "lg", md: "xl" }}>Share Event</ModalHeader>
				<ModalCloseButton />
				<ModalBody pb={6}>
					<Box display="flex" flexDirection="column" gap={3}>
						<Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }}>
							Share the link:
						</Text>
						<Box
							w="100%"
							borderWidth="1px"
							bg="#090C10"
							borderColor="#444444"
							color="white"
							_placeholder={{ color: "gray.400" }}
							rounded="xl"
							p={2}
							wordBreak="break-all"
							fontSize={{ base: "xs", md: "sm" }}
						>
							{sharelink}
						</Box>
						<Button onClick={onCopy} bg="#F79432" color="black" _hover={{ bg: "#f78c22" }} _active={{ bg: "#e67a10" }} size={{ base: "md", md: "lg" }} w="full">
							{copied ? "Copied!" : "Copy"}
						</Button>
					</Box>
				</ModalBody>
			</ModalContent>
		</Modal>
	)
}

function EventDateTime({ iso }: { iso: string }) {
	const [formatted, setFormatted] = useState("")
	useEffect(() => {
		setFormatted(DateTime.fromISO(iso).setZone("America/New_York").toLocaleString(DateTime.DATETIME_MED))
	}, [iso])
	return <p className="font-semibold">{formatted}</p>
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
	const session = await authorizedOnly(context)
	if (!session) return session

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
