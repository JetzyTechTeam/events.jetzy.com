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
}

export default function GroupAcceptPage({ event: eventStr, group: groupStr, user: userStr, isValid, error: serverError }: Props) {
	const [isLoading, setIsLoading] = useState(false)
	const [isAccepted, setIsAccepted] = useState(false)
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

	useEffect(() => {
		// Check if already accepted
		if (groupData && userData) {
			// The status check is done server-side, but we can verify client-side too
			setIsAccepted(false) // Will be set by API response
		}
	}, [groupData, userData])

	const handleAccept = async () => {
		if (!token || !email || !interestId) {
			setError("Missing required parameters")
			return
		}

		setIsLoading(true)
		setError(null)

		try {
			const response = await axios.post(`/api/events/${router.query.eventId}/group/accept`, {
				token,
				email,
				interestId,
			})

			if (response.data.status) {
				setIsAccepted(true)
				toast({
					title: "Success!",
					description: "You have successfully joined the interest group!",
					status: "success",
					duration: 5000,
					isClosable: true,
				})
			} else {
				setError(response.data.message || "Failed to join group")
				toast({
					title: "Error",
					description: response.data.message || "Failed to join group",
					status: "error",
					duration: 5000,
					isClosable: true,
				})
			}
		} catch (err: any) {
			const errorMessage = err.response?.data?.message || err.message || "Failed to join group"
			setError(errorMessage)
			toast({
				title: "Error",
				description: errorMessage,
				status: "error",
				duration: 5000,
				isClosable: true,
			})
		} finally {
			setIsLoading(false)
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
		<ConsoleLayout>
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
									{eventData.startsOn && (
										<Text color="gray.700">
											Date: {new Date(eventData.startsOn).toLocaleDateString()}
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
			},
		}
	}

	try {
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
				},
			}
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
				},
			}
		}

		// Check if user is already in the group
		const interestUser = await InterestUsermodel.findOne({
			interestId: interest._id,
			userId: user._id,
		})

		return {
			props: {
				event: JSON.stringify(event.toJSON()),
				group: JSON.stringify(interest.toJSON()),
				user: JSON.stringify(user.toJSON()),
				isValid: true,
				error: null,
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
			},
		}
	}
}

