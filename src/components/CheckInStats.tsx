import React from "react"
import { Box, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, Card, CardBody, Spinner, Text, HStack, Icon, Progress } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import { CheckCircleIcon, TimeIcon, WarningIcon } from "@chakra-ui/icons"
import { useSession } from "next-auth/react"

interface CheckInStatsProps {
	eventId: string
}

const CheckInStats: React.FC<CheckInStatsProps> = ({ eventId }) => {
	const { data: session } = useSession()
	
	// Check if user is admin
	// @ts-ignore
	const userRole = session?.user?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"

	const { data, isLoading, error } = useQuery({
		queryKey: ["checkInStats", eventId],
		queryFn: async () => {
			const response = await axios.get(`/api/check-in/stats?eventId=${eventId}`)
			return response.data.data
		},
		refetchInterval: 30000, // Refresh every 30 seconds
		enabled: isAdmin, // Only fetch if user is admin
		retry: false, // Don't retry on 403 errors
	})

	if (isLoading) {
		return (
			<Box textAlign="center" py={10} bg="white" borderRadius="xl" boxShadow="sm">
				<Spinner size="xl" color="#8B5CF6" thickness="4px" />
				<Text mt={4} color="#6B7280" fontWeight="medium">
					Loading check-in statistics...
				</Text>
			</Box>
		)
	}

	// Don't show error for non-admin users (they don't have access)
	if (error && isAdmin) {
		return (
			<Box textAlign="center" py={10} bg="white" borderRadius="xl" boxShadow="sm">
				<Icon as={WarningIcon} boxSize={8} color="#EF4444" mb={2} />
				<Text color="#EF4444" fontWeight="medium">
					Failed to load check-in statistics
				</Text>
			</Box>
		)
	}

	// Hide stats for non-admin users
	if (!isAdmin) {
		return null
	}

	const checkInPercentage = data?.checkInPercentage || 0

	return (
		<Box mb={6}>
			{/* Progress Overview Card */}
			<Card bg="white" borderRadius="xl" boxShadow="sm" border="1px solid #E5E7EB" mb={4}>
				<CardBody p={6}>
					<HStack justify="space-between" mb={4}>
						<Box>
							<Text fontSize="sm" fontWeight="semibold" color="#6B7280" textTransform="uppercase" letterSpacing="wide">
								Check-In Progress
							</Text>
							<Text fontSize="3xl" fontWeight="bold" color="#1F2937" mt={1}>
								{data?.totalGuestsCheckedIn || 0}{" "}
								<Text as="span" fontSize="lg" color="#6B7280" fontWeight="normal">
									/ {data?.totalTicketsBooked || 0}
								</Text>
							</Text>
						</Box>
						<Box textAlign="right">
							<Text fontSize="4xl" fontWeight="bold" color="#8B5CF6">
								{checkInPercentage}%
							</Text>
							<Text fontSize="xs" color="#6B7280" fontWeight="medium">
								Complete
							</Text>
						</Box>
					</HStack>
					<Progress
						value={checkInPercentage}
						size="lg"
						colorScheme="purple"
						borderRadius="full"
						bg="#F3F4F6"
						sx={{
							"& > div": {
								background: "linear-gradient(90deg, #8B5CF6 0%, #7C3AED 100%)",
							},
						}}
					/>
				</CardBody>
			</Card>

			{/* Stats Grid */}
			<SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
				<Card bg="white" borderRadius="xl" boxShadow="sm" border="1px solid #E5E7EB" transition="all 0.2s" _hover={{ boxShadow: "md", transform: "translateY(-2px)" }}>
					<CardBody p={5}>
						<Stat>
							<HStack spacing={3} mb={2}>
								<Box bg="#F3F4F6" p={2} borderRadius="lg">
									<Icon as={TimeIcon} boxSize={5} color="#6B7280" />
								</Box>
								<StatLabel fontSize="sm" color="#6B7280" fontWeight="medium" m={0}>
									Total Bookings
								</StatLabel>
							</HStack>
							<StatNumber fontSize="2xl" fontWeight="bold" color="#1F2937" mt={2}>
								{data?.totalBookings || 0}
							</StatNumber>
						</Stat>
					</CardBody>
				</Card>

				<Card bg="white" borderRadius="xl" boxShadow="sm" border="1px solid #E5E7EB" transition="all 0.2s" _hover={{ boxShadow: "md", transform: "translateY(-2px)" }}>
					<CardBody p={5}>
						<Stat>
							<HStack spacing={3} mb={2}>
								<Box bg="#EDE9FE" p={2} borderRadius="lg">
									<Text fontSize="lg">🎟️</Text>
								</Box>
								<StatLabel fontSize="sm" color="#6B7280" fontWeight="medium" m={0}>
									Total Tickets
								</StatLabel>
							</HStack>
							<StatNumber fontSize="2xl" fontWeight="bold" color="#1F2937" mt={2}>
								{data?.totalTicketsBooked || 0}
							</StatNumber>
						</Stat>
					</CardBody>
				</Card>

				<Card bg="linear-gradient(135deg, #10B981 0%, #059669 100%)" borderRadius="xl" boxShadow="sm" transition="all 0.2s" _hover={{ boxShadow: "md", transform: "translateY(-2px)" }}>
					<CardBody p={5}>
						<Stat>
							<HStack spacing={3} mb={2}>
								<Box bg="rgba(255, 255, 255, 0.2)" p={2} borderRadius="lg">
									<Icon as={CheckCircleIcon} boxSize={5} color="white" />
								</Box>
								<StatLabel fontSize="sm" color="white" fontWeight="medium" m={0}>
									Checked In
								</StatLabel>
							</HStack>
							<StatNumber fontSize="2xl" fontWeight="bold" color="white" mt={2}>
								{data?.totalGuestsCheckedIn || 0}
							</StatNumber>
						</Stat>
					</CardBody>
				</Card>

				<Card bg="linear-gradient(135deg, #F59E0B 0%, #D97706 100%)" borderRadius="xl" boxShadow="sm" transition="all 0.2s" _hover={{ boxShadow: "md", transform: "translateY(-2px)" }}>
					<CardBody p={5}>
						<Stat>
							<HStack spacing={3} mb={2}>
								<Box bg="rgba(255, 255, 255, 0.2)" p={2} borderRadius="lg">
									<Text fontSize="lg">⏳</Text>
								</Box>
								<StatLabel fontSize="sm" color="white" fontWeight="medium" m={0}>
									Remaining
								</StatLabel>
							</HStack>
							<StatNumber fontSize="2xl" fontWeight="bold" color="white" mt={2}>
								{data?.remainingGuests || 0}
							</StatNumber>
						</Stat>
					</CardBody>
				</Card>
			</SimpleGrid>
		</Box>
	)
}

export default CheckInStats
