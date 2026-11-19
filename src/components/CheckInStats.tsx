import React, { useState } from "react"
import { Box, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, Card, CardBody, Spinner, Text, useDisclosure } from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import CheckInListModal, { type CheckInListTab } from "@/components/checkin/CheckInListModal"

// Phones only (below Chakra's `md`, 768px). Every rule that uses this sits inside the media
// query, so nothing here can reach a tablet or a desktop.
const PHONE = "@media screen and (max-width: 47.99em)"

// Each tile opens the list behind its number (`CheckInListModal`), on the matching tab.
const TILES: Array<{
	label: string
	color: string
	tab: CheckInListTab
	value: (d: any) => number | string
	help: (d: any) => string
}> = [
	{ label: "Total Bookings", color: "gray.100", tab: "all", value: (d) => d?.totalBookings || 0, help: () => "Total reservations" },
	{ label: "Total Tickets", color: "gray.100", tab: "all", value: (d) => d?.totalTicketsBooked || 0, help: () => "All purchased tickets" },
	{ label: "Checked In", color: "green.400", tab: "in", value: (d) => d?.totalGuestsCheckedIn || 0, help: (d) => `${d?.checkInPercentage || 0}% of total` },
	{ label: "Remaining", color: "orange.400", tab: "remaining", value: (d) => d?.remainingGuests || 0, help: () => "Yet to check in" },
]

interface CheckInStatsProps {
	eventId: string
}

const CheckInStats: React.FC<CheckInStatsProps> = ({ eventId }) => {
	const list = useDisclosure()
	const [listTab, setListTab] = useState<CheckInListTab>("in")
	const openList = (tab: CheckInListTab) => {
		setListTab(tab)
		list.onOpen()
	}

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
		<>
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
			{TILES.map((tile) => (
				<Card
					key={tile.label}
					as="button"
					type="button"
					onClick={() => openList(tile.tab)}
					aria-label={`${tile.label}: show the list`}
					title="Show the list"
					textAlign="left"
					bg="#1E1E1E"
					border="1px solid #434343"
					cursor="pointer"
					transition="border-color 0.15s"
					_hover={{ borderColor: "#F79432" }}
					_focusVisible={{ outline: "2px solid #F79432", outlineOffset: "2px" }}
				>
					<CardBody w="full">
						<Stat>
							<StatLabel color="gray.400">{tile.label}</StatLabel>
							<StatNumber fontSize="3xl" color={tile.color}>
								{tile.value(data)}
							</StatNumber>
							<StatHelpText color="gray.500">{tile.help(data)}</StatHelpText>
						</Stat>
					</CardBody>
				</Card>
			))}
		</SimpleGrid>
		<CheckInListModal eventId={eventId} isOpen={list.isOpen} onClose={list.onClose} initialTab={listTab} />
		</>
	)
}

export default CheckInStats
