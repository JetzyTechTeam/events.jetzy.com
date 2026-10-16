import React from "react"
import { Box, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, Card, CardBody, Spinner, Text } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

// Phones only (below Chakra's `md`, 768px). Every rule that uses this sits inside the media
// query, so nothing here can reach a tablet or a desktop.
const PHONE = "@media screen and (max-width: 47.99em)"

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
		// Phones: ONE row of four small tiles. Stacked one per row (the old `base: 1`) they
		// were about 500px tall, and this page is used at the door - the email box and the
		// Scan button started below the first screen. The helper line under each number is
		// dropped there; the label already says what the number is.
		<SimpleGrid
			columns={{ base: 4, md: 2, lg: 4 }}
			spacing={{ base: 2, md: 6 }}
			mb={{ base: 4, md: 8 }}
			sx={{ [PHONE]: {
				"& .chakra-card__body": { padding: "8px" },
				"& .chakra-stat__label": { fontSize: "11px", lineHeight: 1.2 },
				"& .chakra-stat__number": { fontSize: "20px", lineHeight: 1.3 },
				"& .chakra-stat__help-text": { display: "none" },
			} }}
		>
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
