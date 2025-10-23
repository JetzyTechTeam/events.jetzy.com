import React from "react"
import { Box, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, Card, CardBody, Spinner, Text } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

interface CheckInStatsProps {
	eventId: string
}

const CheckInStats: React.FC<CheckInStatsProps> = ({ eventId }) => {
	const { data, isLoading, error } = useQuery({
		queryKey: ["checkInStats", eventId],
		queryFn: async () => {
			const response = await axios.get(`/api/check-in/stats?eventId=${eventId}`)
			return response.data.data
		},
		refetchInterval: 30000, // Refresh every 30 seconds
	})

	if (isLoading) {
		return (
			<Box textAlign="center" py={10}>
				<Spinner size="xl" color="#F79432" />
				<Text mt={4} color="gray.400">
					Loading check-in statistics...
				</Text>
			</Box>
		)
	}

	if (error) {
		return (
			<Box textAlign="center" py={10}>
				<Text color="red.400">Failed to load check-in statistics</Text>
			</Box>
		)
	}

	return (
		<SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6} mb={8}>
			<Card bg="#1E1E1E" border="1px solid #434343">
				<CardBody>
					<Stat>
						<StatLabel color="gray.400">Total Bookings</StatLabel>
						<StatNumber fontSize="3xl" color="gray.100">
							{data?.totalBookings || 0}
						</StatNumber>
						<StatHelpText color="gray.500">Total reservations</StatHelpText>
					</Stat>
				</CardBody>
			</Card>

			<Card bg="#1E1E1E" border="1px solid #434343">
				<CardBody>
					<Stat>
						<StatLabel color="gray.400">Total Tickets</StatLabel>
						<StatNumber fontSize="3xl" color="gray.100">
							{data?.totalTicketsBooked || 0}
						</StatNumber>
						<StatHelpText color="gray.500">All purchased tickets</StatHelpText>
					</Stat>
				</CardBody>
			</Card>

			<Card bg="#1E1E1E" border="1px solid #434343">
				<CardBody>
					<Stat>
						<StatLabel color="gray.400">Checked In</StatLabel>
						<StatNumber fontSize="3xl" color="green.400">
							{data?.totalGuestsCheckedIn || 0}
						</StatNumber>
						<StatHelpText color="gray.500">{data?.checkInPercentage || 0}% of total</StatHelpText>
					</Stat>
				</CardBody>
			</Card>

			<Card bg="#1E1E1E" border="1px solid #434343">
				<CardBody>
					<Stat>
						<StatLabel color="gray.400">Remaining</StatLabel>
						<StatNumber fontSize="3xl" color="orange.400">
							{data?.remainingGuests || 0}
						</StatNumber>
						<StatHelpText color="gray.500">Yet to check in</StatHelpText>
					</Stat>
				</CardBody>
			</Card>
		</SimpleGrid>
	)
}

export default CheckInStats
