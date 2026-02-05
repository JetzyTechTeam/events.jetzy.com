import React from "react"
import { Box, Text } from "@chakra-ui/react"

interface VisitorChartProps {
	data: Array<{
		date: string
		totalSessions: number
		loggedInSessions: number
		anonymousSessions: number
		uniqueVisitors: number
	}>
}

export default function VisitorChart({ data }: VisitorChartProps) {
	if (!data || data.length === 0) {
		return (
			<Box p={8} textAlign="center" color="#65676B">
				<Text>No visitor data available for the selected period</Text>
			</Box>
		)
	}

	const maxValue = Math.max(...data.map((d) => Math.max(d.totalSessions, d.uniqueVisitors)))

	return (
		<Box>
			<Box position="relative" height="300px" width="100%">
				{/* Y-axis labels */}
				<Box position="absolute" left={0} top={0} bottom={0} width="40px" borderRight="1px solid #E5E7EB">
					{[...Array(5)].map((_, i) => {
						const value = Math.round((maxValue / 4) * (4 - i))
						return (
							<Box key={i} position="absolute" bottom={`${(i / 4) * 100}%`} fontSize="xs" color="#65676B" right="4px">
								{value}
							</Box>
						)
					})}
				</Box>

				{/* Chart area */}
				<Box ml="50px" mr="20px" position="relative" height="100%">
					{/* Grid lines */}
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

					{/* Bars */}
					<Box display="flex" height="100%" alignItems="flex-end" gap="8px" paddingBottom="20px">
						{data.map((item, index) => {
							const barHeight = maxValue > 0 ? (item.totalSessions / maxValue) * 100 : 0
							const loggedInHeight = maxValue > 0 ? (item.loggedInSessions / maxValue) * 100 : 0
							return (
								<Box key={index} flex="1" display="flex" flexDirection="column" alignItems="center" position="relative">
									{/* Total sessions bar (stacked) */}
									<Box
										width="100%"
										height={`${barHeight}%`}
										bg="#1877F2"
										borderRadius="4px 4px 0 0"
										minHeight="2px"
										position="relative"
									>
										{/* Logged in portion */}
										{item.loggedInSessions > 0 && (
											<Box
												position="absolute"
												bottom={0}
												left={0}
												right={0}
												height={`${(item.loggedInSessions / item.totalSessions) * 100}%`}
												bg="#42A5F5"
												borderRadius="4px 4px 0 0"
											/>
										)}
									</Box>
									{/* Date label */}
									<Text fontSize="xs" color="#65676B" mt={1} style={{ transform: "rotate(-45deg)", transformOrigin: "center" }} whiteSpace="nowrap">
										{new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
									</Text>
								</Box>
							)
						})}
					</Box>
				</Box>
			</Box>

			{/* Legend */}
			<Box display="flex" gap={4} justifyContent="center" mt={4}>
				<Box display="flex" alignItems="center" gap={2}>
					<Box width="16px" height="16px" bg="#1877F2" borderRadius="2px" />
					<Text fontSize="sm" color="#65676B">
						Total Sessions
					</Text>
				</Box>
				<Box display="flex" alignItems="center" gap={2}>
					<Box width="16px" height="16px" bg="#42A5F5" borderRadius="2px" />
					<Text fontSize="sm" color="#65676B">
						Logged In
					</Text>
				</Box>
			</Box>
		</Box>
	)
}

