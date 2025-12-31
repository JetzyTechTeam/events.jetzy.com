import React from "react"
import { Box, Text } from "@chakra-ui/react"

interface BookingTrendsChartProps {
	data: Array<{
		date: string
		totalBookings: number
		totalRevenue: number
		byStatus?: Record<string, number>
	}>
}

export default function BookingTrendsChart({ data }: BookingTrendsChartProps) {
	if (!data || data.length === 0) {
		return (
			<Box p={8} textAlign="center" color="#65676B">
				<Text>No booking data available for the selected period</Text>
			</Box>
		)
	}

	const maxBookings = Math.max(...data.map((d) => d.totalBookings))
	const maxRevenue = Math.max(...data.map((d) => d.totalRevenue))

	return (
		<Box>
			{/* Bookings Chart */}
			<Box mb={8}>
				<Text fontSize="md" fontWeight="bold" mb={4} color="#1C1E21">
					Bookings Over Time
				</Text>
				<Box position="relative" height="250px" width="100%">
					<Box position="absolute" left={0} top={0} bottom={0} width="40px" borderRight="1px solid #E5E7EB">
						{[...Array(5)].map((_, i) => {
							const value = Math.round((maxBookings / 4) * (4 - i))
							return (
								<Box key={i} position="absolute" bottom={`${(i / 4) * 100}%`} fontSize="xs" color="#65676B" right="4px">
									{value}
								</Box>
							)
						})}
					</Box>
					<Box ml="50px" mr="20px" position="relative" height="100%">
						{[...Array(5)].map((_, i) => (
							<Box
								key={i}
								position="absolute"
								top={`${(i / 4) * 100}%`}
								left={0}
								right={0}
								borderTop="1px solid #F0F2F5"
								height="1px"
							/>
						))}
						<Box display="flex" height="100%" alignItems="flex-end" gap="4px" paddingBottom="20px">
							{data.map((item, index) => {
								const barHeight = maxBookings > 0 ? (item.totalBookings / maxBookings) * 100 : 0
								return (
									<Box key={index} flex="1" display="flex" flexDirection="column" alignItems="center" position="relative">
										<Box
											width="100%"
											height={`${barHeight}%`}
											bg="#4CAF50"
											borderRadius="4px 4px 0 0"
											minHeight="2px"
											title={`${item.totalBookings} bookings`}
										/>
										<Text fontSize="xs" color="#65676B" mt={1} style={{ transform: "rotate(-45deg)", transformOrigin: "center" }} whiteSpace="nowrap">
											{new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
										</Text>
									</Box>
								)
							})}
						</Box>
					</Box>
				</Box>
			</Box>

			{/* Revenue Chart */}
			<Box>
				<Text fontSize="md" fontWeight="bold" mb={4} color="#1C1E21">
					Revenue Over Time
				</Text>
				<Box position="relative" height="250px" width="100%">
					<Box position="absolute" left={0} top={0} bottom={0} width="60px" borderRight="1px solid #E5E7EB">
						{[...Array(5)].map((_, i) => {
							const value = (maxRevenue / 4) * (4 - i)
							const formatted = value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${Math.round(value)}`
							return (
								<Box key={i} position="absolute" bottom={`${(i / 4) * 100}%`} fontSize="xs" color="#65676B" right="4px">
									{formatted}
								</Box>
							)
						})}
					</Box>
					<Box ml="70px" mr="20px" position="relative" height="100%">
						{[...Array(5)].map((_, i) => (
							<Box
								key={i}
								position="absolute"
								top={`${(i / 4) * 100}%`}
								left={0}
								right={0}
								borderTop="1px solid #F0F2F5"
								height="1px"
							/>
						))}
						<Box display="flex" height="100%" alignItems="flex-end" gap="4px" paddingBottom="20px">
							{data.map((item, index) => {
								const barHeight = maxRevenue > 0 ? (item.totalRevenue / maxRevenue) * 100 : 0
								return (
									<Box key={index} flex="1" display="flex" flexDirection="column" alignItems="center" position="relative">
										<Box
											width="100%"
											height={`${barHeight}%`}
											bg="#2196F3"
											borderRadius="4px 4px 0 0"
											minHeight="2px"
											title={`$${item.totalRevenue.toFixed(2)}`}
										/>
										<Text fontSize="xs" color="#65676B" mt={1} style={{ transform: "rotate(-45deg)", transformOrigin: "center" }} whiteSpace="nowrap">
											{new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
										</Text>
									</Box>
								)
							})}
						</Box>
					</Box>
				</Box>
			</Box>
		</Box>
	)
}

