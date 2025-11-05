import { GetServerSideProps } from "next"
import { useRouter } from "next/router"
import React, { useState, useEffect } from "react"
import { Box, Button, Flex, Heading, Text, useToast, Spinner } from "@chakra-ui/react"
import ConsoleLayout from "@/components/layout/ConsoleLayout"
import { Events } from "@/models/events"
import { IEvent } from "@/models/events/types"
import InterestV2model from "@/models/interest-v2"
import InterestUsermodel from "@/models/interest-user"
import { Users } from "@/models/userModal"
import axios from "axios"
import { Types } from "mongoose"
import Image from "next/image"
import crypto from "crypto"

type Props = {
	event: string
	group: string | null
	user: string | null
	isValid: boolean
	error: string | null
	formattedDate?: string
	alreadyAccepted?: boolean
}

export default function GroupAcceptPage({ event: eventStr, group: groupStr, user: userStr, isValid, error: serverError, formattedDate, alreadyAccepted: initialAccepted }: Props) {
	const [isLoading, setIsLoading] = useState(false)
	const [isAccepted, setIsAccepted] = useState(initialAccepted || false)
	const [error, setError] = useState<string | null>(serverError)
	const toast = useToast()
	const router = useRouter()

	const { token, email, interestId } = router.query

	let eventData: IEvent | null = null
	let groupData: any = null
	let userData: any = null

	try {
		if (eventStr) eventData = JSON.parse(eventStr) as IEvent
		if (groupStr) groupData = JSON.parse(groupStr)
		if (userStr) userData = JSON.parse(userStr)
	} catch (e) {
		console.error("Error parsing data:", e)
	}

	// Debug: Log when isAccepted changes
	useEffect(() => {
		console.log("[GroupAccept] isAccepted state changed:", isAccepted)
	}, [isAccepted])

	const handleAccept = async () => {
		if (!token || !email || !interestId) {
			setError("Missing required parameters")
			return
		}

		setIsLoading(true)
		setError(null)

		try {
			console.log("[GroupAccept] Sending accept request:", { token, email, interestId })
			const response = await axios.post(`/api/events/${router.query.eventId}/group/accept`, {
				token,
				email,
				interestId,
			})

			console.log("[GroupAccept] Response received:", response.data)

			if (response.data.status === true) {
				console.log("[GroupAccept] Response status is true, updating state")
				// Clear any errors first
				setError(null)
				// Update state - use callback to ensure state update
				setIsAccepted((prev) => {
					console.log("[GroupAccept] isAccepted state update:", prev, "-> true")
					return true
				})
				setIsLoading(false)
				toast({
					title: "Success!",
					description: "You have successfully joined the interest group!",
					status: "success",
					duration: 5000,
					isClosable: true,
				})
			} else {
				console.log("[GroupAccept] Response status was false:", response.data)
				setError(response.data.message || "Failed to join group")
				setIsLoading(false)
				toast({
					title: "Error",
					description: response.data.message || "Failed to join group",
					status: "error",
					duration: 5000,
					isClosable: true,
				})
			}
		} catch (err: any) {
			console.error("[GroupAccept] Error:", err)
			const errorMessage = err.response?.data?.message || err.message || "Failed to join group"
			setError(errorMessage)
			setIsLoading(false)
			toast({
				title: "Error",
				description: errorMessage,
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		}
	}

	if (!isValid || !eventData || !groupData || !userData) {
		return (
			<ConsoleLayout>
				<Box maxW="4xl" mx="auto" mt={8} p={6}>
					<Heading color="red.500" mb={4}>
						Invalid Invitation
					</Heading>
					<Text color="gray.600">
						{serverError || "This invitation link is invalid or has expired. Please contact the event organizer."}
					</Text>
				</Box>
			</ConsoleLayout>
		)
	}

	if (isAccepted) {
		return (
			<ConsoleLayout>
				<Box maxW="4xl" mx="auto" mt={8} p={6} bg="green.50" borderRadius="lg" border="2px solid" borderColor="green.200">
					<Heading color="green.600" mb={4}>
						Successfully Joined!
					</Heading>
					<Text color="gray.700" mb={4}>
						You have successfully joined the interest group <strong>{groupData.name}</strong>.
					</Text>
					<Button
						colorScheme="blue"
						onClick={() => router.push(`/${router.query.eventId}`)}
					>
						View Event
					</Button>
				</Box>
			</ConsoleLayout>
		)
	}

	return (
		<ConsoleLayout key={isAccepted ? "accepted" : "pending"}>
			<Box maxW="5xl" mx="auto" mt={8}>
				<Flex gap={6} direction={{ base: "column", md: "row" }}>
					{/* Event Image */}
					<Box w={{ base: "100%", md: "360px" }} flexShrink={0}>
						{eventData.images && eventData.images.length > 0 && (
							<Image
								src={eventData.images[0]}
								alt={eventData.name}
								width={360}
								height={480}
								style={{ borderRadius: "8px", objectFit: "cover" }}
							/>
						)}
					</Box>

					{/* Content */}
					<Box flex={1} bg="white" p={6} borderRadius="lg" boxShadow="md">
						<Heading size="lg" mb={4}>
							Join Interest Group
						</Heading>
						<Text fontSize="lg" color="gray.600" mb={6}>
							You've been invited to join the interest group for:
						</Text>
						<Box mb={6}>
							<Heading size="md" color="orange.500" mb={2}>
								{groupData.name}
							</Heading>
							{groupData.description && (
								<Text color="gray.700" mb={4}>
									{groupData.description}
								</Text>
							)}
							{eventData && (
								<Box mt={4} p={4} bg="gray.50" borderRadius="md">
									<Text fontWeight="bold" mb={2}>
										Event Details:
									</Text>
									<Text color="gray.700">Location: {eventData.location}</Text>
									{formattedDate && (
										<Text color="gray.700">
											Date: {formattedDate}
										</Text>
									)}
								</Box>
							)}
						</Box>

						{error && (
							<Box p={4} bg="red.50" borderRadius="md" mb={4} border="1px solid" borderColor="red.200">
								<Text color="red.600">{error}</Text>
							</Box>
						)}

						<Flex gap={4} mt={6}>
							{isAccepted ? (
								<Button
									colorScheme="green"
									color="white"
									w="full"
									size="lg"
									disabled
								>
									✓ Already Joined
								</Button>
							) : (
								<Button
									colorScheme="orange"
									color="black"
									w="full"
									onClick={handleAccept}
									isLoading={isLoading}
									disabled={isLoading || isAccepted}
									size="lg"
								>
									{isLoading ? <Spinner size="sm" /> : "Accept & Join Group"}
								</Button>
							)}
						</Flex>
					</Box>
				</Flex>
			</Box>
		</ConsoleLayout>
	)
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
	const { eventId, token, email, interestId } = context.query

	if (!eventId || !token || !email || !interestId) {
		return {
			props: {
				event: "",
				group: null,
				user: null,
				isValid: false,
				error: "Missing required parameters",
				formattedDate: undefined,
				alreadyAccepted: false,
			},
		}
	}

	try {
		// Ensure database connection is ready
		const { dbconn } = await import("@/configs/database")
		if (dbconn.readyState !== 1) {
			console.log("[GroupAccept] Database not connected, attempting to connect...")
			await dbconn.asPromise()
		}

		// Get event
		const event = await Events.findOne({
			_id: new Types.ObjectId(eventId as string),
			isDeleted: false,
		})

		if (!event) {
			return {
				props: {
					event: "",
					group: null,
					user: null,
					isValid: false,
					error: "Event not found",
					formattedDate: undefined,
					alreadyAccepted: false,
				},
			}
		}

		// Format date consistently for server and client
		let formattedDate: string | undefined
		if (event.startsOn) {
			const date = new Date(event.startsOn)
			formattedDate = date.toLocaleDateString("en-US", {
				year: "numeric",
				month: "long",
				day: "numeric",
			})
		}

		// Get interest group
		const interest = await InterestV2model.findById(new Types.ObjectId(interestId as string))
		if (!interest) {
			return {
				props: {
					event: JSON.stringify(event.toJSON()),
					group: null,
					user: null,
					isValid: false,
					error: "Interest group not found",
					formattedDate,
					alreadyAccepted: false,
				},
			}
		}

		// Get user
		const user = await Users.findOne({ email: (email as string).toLowerCase().trim() })
		if (!user) {
			return {
				props: {
					event: JSON.stringify(event.toJSON()),
					group: JSON.stringify(interest.toJSON()),
					user: null,
					isValid: false,
					error: "User not found",
					formattedDate,
					alreadyAccepted: false,
				},
			}
		}

		// Verify token
		const secret = process.env.JWT_SECRET || "default-secret-key"
		const data = `${interestId}:${user._id.toString()}:${email}:${secret}`
		const expectedToken = crypto.createHash("sha256").update(data).digest("hex").substring(0, 32)

		if (token !== expectedToken) {
			return {
				props: {
					event: JSON.stringify(event.toJSON()),
					group: JSON.stringify(interest.toJSON()),
					user: JSON.stringify(user.toJSON()),
					isValid: false,
					error: "Invalid or expired invitation link",
					formattedDate,
					alreadyAccepted: false,
				},
			}
		}

		// Check if user is already in the group
		const interestUser = await InterestUsermodel.findOne({
			interestId: interest._id,
			userId: user._id,
		})

		const alreadyAccepted = interestUser?.status === "active"

		return {
			props: {
				event: JSON.stringify(event.toJSON()),
				group: JSON.stringify(interest.toJSON()),
				user: JSON.stringify(user.toJSON()),
				isValid: true,
				error: null,
				formattedDate,
				alreadyAccepted,
			},
		}
	} catch (error: any) {
		console.error("Error in getServerSideProps:", error)
		return {
			props: {
				event: "",
				group: null,
				user: null,
				isValid: false,
				error: error.message || "An error occurred",
				formattedDate: undefined,
				alreadyAccepted: false,
			},
		}
	}
}

